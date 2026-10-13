import "server-only";
import { createHash, randomInt, randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  createAccountSession,
  getAccountByEmail,
  getAccountById,
} from "./accounts";
import { MailDeliveryError, sendAccountMail } from "./mail-delivery";

export const CODE_VERIFICATION_INFO = {
  requiresVerification: true,
  verificationMethod: "code",
  expiresIn: 600,
  resendAfter: 60,
} as const;

export class AccountExistsError extends Error {
  readonly code = "ACCOUNT_EXISTS";
  readonly status = 409;
  constructor() {
    super("此邮箱已注册并验证，请直接登录。");
  }
}
export class EmailCodeCooldownError extends Error {
  constructor(readonly retryAfter: number) {
    super("请稍后重新发送验证码。");
  }
}
export class EmailVerificationInputError extends Error {
  readonly status = 400;
  constructor(readonly code: "INVALID_INPUT" | "REGISTRATION_REQUIRED") {
    super(
      code === "INVALID_INPUT"
        ? "请输入有效的邮箱地址。"
        : "请先注册账号后获取验证码。",
    );
  }
}
function codeDigest(challengeId: string, code: string) {
  return createHash("sha256").update(`${challengeId}:${code}`).digest("hex");
}
export function validEmailCode(code: unknown): code is string {
  return typeof code === "string" && /^\d{6}$/.test(code);
}
export async function sendEmailVerificationCode(
  accountId: string,
  email: string,
) {
  const client = createSupabaseAdminClient();
  const challengeId = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const reserved = await client.rpc("reserve_account_email_code", {
    p_account_id: accountId,
    p_challenge_id: challengeId,
    p_code_digest: codeDigest(challengeId, code),
  });
  if (reserved.error) throw reserved.error;
  const reservation = reserved.data as { status: string; retryAfter?: number };
  if (reservation.status === "verified") throw new AccountExistsError();
  if (reservation.status === "cooldown")
    throw new EmailCodeCooldownError(reservation.retryAfter ?? 60);
  if (reservation.status !== "reserved") throw new MailDeliveryError();
  try {
    await sendAccountMail({
      to: email,
      subject: "叮咚小组邮箱验证码",
      text: `验证码：${code}\n请在网站输入这 6 位数字完成邮箱验证。验证码 10 分钟内有效，请勿转发给他人。`,
    });
    const activated = await client.rpc("activate_account_email_code", {
      p_account_id: accountId,
      p_challenge_id: challengeId,
    });
    if (activated.error) throw activated.error;
    if (!activated.data) throw new MailDeliveryError();
  } catch (error) {
    const canceled = await client.rpc("cancel_account_email_code", {
      p_account_id: accountId,
      p_challenge_id: challengeId,
    });
    if (canceled.error) throw new MailDeliveryError();
    throw error;
  }
}
export async function verifyLocalEmailCode(email: string, code: string) {
  const account = await getAccountByEmail(email);
  if (!account || account.verified_at || account.auth_provider !== "local")
    return null;
  const client = createSupabaseAdminClient();
  const challenge = await client
    .from("account_email_codes")
    .select("id")
    .eq("account_id", String(account.id))
    .not("delivered_at", "is", null)
    .is("canceled_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (challenge.error) throw challenge.error;
  if (!challenge.data) return null;
  const consumed = await client.rpc("consume_account_email_code", {
    p_account_id: String(account.id),
    p_challenge_id: challenge.data.id,
    p_code_digest: codeDigest(challenge.data.id, code),
  });
  if (consumed.error) throw consumed.error;
  if (!consumed.data) return null;
  const verified = await getAccountById(String(consumed.data));
  if (!verified?.verified_at) return null;
  return {
    account: verified,
    ...(await createAccountSession(String(verified.id))),
  };
}
