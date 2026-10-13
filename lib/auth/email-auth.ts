import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  createAccount,
  createAccountSession,
  getAccountByEmail,
  getAccountById,
  issueAccountToken,
  completePasswordReset,
} from "./accounts";
import { hashPassword, verifyPassword, validatePassword } from "./password";
import { localMailUrl } from "./local-mail";
import {
  getMailDeliveryMode,
  readSmtpConfig,
  mailResponseInfo,
  sendAccountMail,
  MailDeliveryError,
  validMailAddress,
} from "./mail-delivery";
import { digestToken } from "./token";
import {
  AccountExistsError,
  CODE_VERIFICATION_INFO,
  EmailCodeCooldownError,
  EmailVerificationInputError,
  sendEmailVerificationCode,
} from "./email-code";

export const GENERIC_MESSAGE =
  "如果该邮箱可以接收邮件，我们已发送操作说明，请查看收件箱。";
const PREVIEW_MESSAGE =
  "如果该邮箱符合操作条件，本地邮件已生成，请查看本地测试收件箱。此模式不会发送到真实邮箱。";
export const isCloudAuth = () =>
  process.env.CHECKIN_STORAGE === "supabase" ||
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
export function validEmail(value: string): boolean {
  return validMailAddress(value);
}
function cloudMailError(error: { status?: number; code?: string }): never {
  if (
    error.status === 429 ||
    ["over_email_send_rate_limit", "over_request_rate_limit"].includes(
      error.code ?? "",
    )
  )
    throw new EmailCodeCooldownError(60);
  throw new MailDeliveryError();
}
export function validateCredentials(body: Record<string, unknown>) {
  const email = normalizeEmail(body.email);
  const password = body.password;
  const nickname =
    typeof body.nickname === "string" ? body.nickname.trim() : "";
  if (!validEmail(email) || !validatePassword(password))
    throw new Error("Invalid credentials");
  return { email, password, nickname };
}
export async function registerLocal(body: Record<string, unknown>) {
  const { email, password, nickname } = validateCredentials(body);
  if (!nickname || nickname.length > 24) throw new Error("Invalid nickname");
  const delivery = getMailDeliveryMode();
  if (delivery === "smtp") readSmtpConfig();
  const message =
    delivery === "preview"
      ? "验证码已生成，请查看本地测试收件箱。"
      : "验证码已发送，请查看邮箱。";
  const existing = await getAccountByEmail(email);
  if (existing?.verified_at) throw new AccountExistsError();
  const account =
    existing ??
    (await createAccount({
      email,
      nickname,
      password_hash: await hashPassword(password),
    }));
  await sendEmailVerificationCode(String(account.id), email);
  return {
    message,
    ...CODE_VERIFICATION_INFO,
    ...mailResponseInfo(delivery),
  };
}
export async function loginLocal(body: Record<string, unknown>) {
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!validEmail(email) || typeof password !== "string") return null;
  const account = await getAccountByEmail(email);
  if (
    !account ||
    !account.password_hash ||
    !(await verifyPassword(password, String(account.password_hash)))
  )
    return null;
  if (!account.verified_at) return { unverified: true } as const;
  const session = await createAccountSession(String(account.id));
  return { account, ...session };
}
export async function resendLocal(emailInput: unknown) {
  const email = normalizeEmail(emailInput);
  if (!validEmail(email))
    throw new EmailVerificationInputError("INVALID_INPUT");
  const delivery = getMailDeliveryMode();
  if (delivery === "smtp") readSmtpConfig();
  const result = {
    message:
      delivery === "preview"
        ? "验证码已生成，请查看本地测试收件箱。"
        : "验证码已发送，请查看邮箱。",
    ...CODE_VERIFICATION_INFO,
    ...mailResponseInfo(delivery),
  };
  const account = await getAccountByEmail(email);
  if (!account) throw new EmailVerificationInputError("REGISTRATION_REQUIRED");
  if (account?.verified_at) throw new AccountExistsError();
  if (account && !account.verified_at)
    await sendEmailVerificationCode(String(account.id), email);
  return result;
}
export async function requestResetLocal(emailInput: unknown) {
  const delivery = getMailDeliveryMode();
  if (delivery === "smtp") readSmtpConfig();
  const result = {
    message: delivery === "preview" ? PREVIEW_MESSAGE : GENERIC_MESSAGE,
    ...mailResponseInfo(delivery),
  };
  const email = normalizeEmail(emailInput);
  if (!validEmail(email)) return result;
  const account = await getAccountByEmail(email);
  if (account && account.verified_at) {
    const ticket = await issueAccountToken(String(account.id), "reset");
    const url = localMailUrl(ticket.token, "reset");
    await sendAccountMail({
      to: email,
      subject: "重置叮咚小组账号密码",
      text: `请打开链接设置新密码，链接 1 小时内有效：${url}`,
      url,
    });
  }
  return result;
}
export async function confirmLocal(token: string, type: string) {
  if (type !== "signup" || !token || token.length > 256) return null;
  const { data, error } = await createSupabaseAdminClient().rpc(
    "complete_account_email_verification",
    { p_token_digest: digestToken(token) },
  );
  if (error) throw error;
  return data ? { accountId: String(data), purpose: "verify" as const } : null;
}
export async function resetLocal(token: string, password: unknown) {
  if (!validatePassword(password)) return false;
  const client = createSupabaseAdminClient();
  const accountId = await completePasswordReset(
    token,
    await hashPassword(password as string),
    client,
  );
  return Boolean(accountId);
}
export async function resetCloud(token: string, password: unknown) {
  if (!validatePassword(password)) return false;
  const client = createSupabaseAdminClient();
  const accountId = await completePasswordReset(token, "", client);
  if (!accountId) return false;
  const updated = await client.auth.admin.updateUserById(String(accountId), {
    password: password as string,
  });
  if (updated.error) throw updated.error;
  return true;
}
export async function registerCloud(body: Record<string, unknown>) {
  const { email, password, nickname } = validateCredentials(body);
  if (!nickname || nickname.length > 24) throw new Error("Invalid nickname");
  const existing = await getAccountByEmail(email);
  if (existing) {
    if (existing.verified_at) throw new AccountExistsError();
    if (!existing.verified_at) await resendCloud(email);
    return {
      message: GENERIC_MESSAGE,
      ...CODE_VERIFICATION_INFO,
      ...mailResponseInfo("supabase"),
    };
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { nickname },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm?type=email`,
    },
  });
  if (error) cloudMailError(error);
  // Store a pending application record so repeated signup cannot replace the
  // original password of an unconfirmed Supabase identity.
  if (
    data.user &&
    !data.user.email_confirmed_at &&
    data.user.email?.toLowerCase() === email &&
    data.user.identities?.length
  ) {
    const checked = await createSupabaseAdminClient().auth.admin.getUserById(
      data.user.id,
    );
    if (!checked.error && checked.data.user?.id === data.user.id) {
      try {
        await createAccount({
          id: data.user.id,
          email,
          nickname,
          auth_provider: "supabase",
          password_hash: null,
        });
      } catch (failure) {
        if ((failure as { code?: string }).code !== "23505") throw failure;
      }
    }
  }
  return {
    message: GENERIC_MESSAGE,
    ...CODE_VERIFICATION_INFO,
    ...mailResponseInfo("supabase"),
  };
}
export async function loginCloud(body: Record<string, unknown>) {
  const { email, password } = validateCredentials({
    email: body.email,
    password: body.password,
    nickname: "ok",
  });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error?.code === "email_not_confirmed")
    return { unverified: true } as const;
  if (error || !data.user || !data.user.email_confirmed_at) return null;
  const account =
    (await getAccountById(data.user.id)) ??
    (await createAccount({
      id: data.user.id,
      email,
      nickname: String(
        data.user.user_metadata?.nickname ?? email.split("@")[0],
      ),
      auth_provider: "supabase",
      password_hash: null,
    }));
  const verified = await createSupabaseAdminClient()
    .from("app_accounts")
    .update({ verified_at: data.user.email_confirmed_at })
    .eq("id", data.user.id);
  if (verified.error) throw verified.error;
  const session = await createAccountSession(String(account.id));
  return { account, ...session };
}
export async function resendCloud(emailInput: unknown) {
  const email = normalizeEmail(emailInput);
  if (!validEmail(email))
    throw new EmailVerificationInputError("INVALID_INPUT");
  const existing = await getAccountByEmail(email);
  if (!existing) throw new EmailVerificationInputError("REGISTRATION_REQUIRED");
  if (existing?.verified_at) throw new AccountExistsError();
  const { error } = await createSupabaseAdminClient().auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm?type=email`,
    },
  });
  if (error) cloudMailError(error);
  return {
    message: GENERIC_MESSAGE,
    ...CODE_VERIFICATION_INFO,
    ...mailResponseInfo("supabase"),
  };
}
export async function verifyCloudEmailCode(email: string, code: string) {
  const { data, error } = await createSupabaseAdminClient().auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  const user = data.user;
  if (
    error ||
    !user ||
    normalizeEmail(user.email) !== email ||
    !user.email_confirmed_at
  )
    return null;
  // verifyOtp installs the user JWT on its client; database operations need a fresh privileged client.
  const client = createSupabaseAdminClient();
  const account = await getAccountById(user.id, client);
  if (
    !account ||
    normalizeEmail(account.email) !== email ||
    account.auth_provider !== "supabase"
  )
    return null;
  const updated = await client
    .from("app_accounts")
    .update({ verified_at: user.email_confirmed_at })
    .eq("id", user.id);
  if (updated.error) throw updated.error;
  return {
    account: { ...account, verified_at: user.email_confirmed_at },
    ...(await createAccountSession(String(account.id), null, client)),
  };
}
export async function requestResetCloud(emailInput: unknown) {
  const email = normalizeEmail(emailInput);
  if (!validEmail(email)) return;
  const { error } =
    await createSupabaseAdminClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm?type=recovery`,
    });
  if (error) throw new MailDeliveryError();
  return { message: GENERIC_MESSAGE, ...mailResponseInfo("supabase") };
}
