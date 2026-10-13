import { NextRequest } from "next/server";
import { confirmLocal, isCloudAuth } from "@/lib/auth/email-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  accountCookieHeader,
  createAccount,
  createAccountSession,
  getAccountById,
  issueAccountToken,
  RECOVERY_COOKIE,
} from "@/lib/auth/accounts";
const redirect = (url: URL) =>
  new Response(null, {
    status: 303,
    headers: {
      location: url.toString(),
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    },
  });

function confirmationOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      )
        return parsed.origin;
    } catch {}
  }
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  if (host) {
    try {
      const authority = new URL(`${requestUrl.protocol}//${host}`);
      if (authority.host === host && !authority.username && !authority.password)
        return authority.origin;
    } catch {}
  }
  return requestUrl.origin;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token =
    url.searchParams.get("token") ?? url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") ?? "signup";
  const origin = confirmationOrigin(request);
  const invalid = () => redirect(new URL("/?authError=expired", origin));
  if (!token || token.length > 256) return invalid();
  try {
    if (!isCloudAuth()) {
      if (type === "reset")
        return redirect(
          new URL(`/reset-password?token=${encodeURIComponent(token)}`, origin),
        );
      const result = await confirmLocal(token, type);
      if (!result) return invalid();
      const response = redirect(new URL("/spaces", origin));
      if (result.purpose === "verify") {
        const account = await getAccountById(result.accountId);
        if (account) {
          const session = await createAccountSession(result.accountId);
          response.headers.append(
            "set-cookie",
            accountCookieHeader(session.token, session.expiresAt),
          );
        }
      }
      return response;
    }
    if (type !== "email" && type !== "recovery") return invalid();
    const supabase = createSupabaseAdminClient();
    const verifyType = type === "recovery" ? "recovery" : "email";
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: verifyType as "email" | "recovery",
    });
    if (error || !data.user) return invalid();
    const existing = await getAccountById(data.user.id);
    const account =
      existing ??
      (verifyType === "recovery"
        ? null
        : await createAccount({
            id: data.user.id,
            email: data.user.email ?? "",
            nickname: String(
              data.user.user_metadata?.nickname ??
                (data.user.email ?? "user").split("@")[0],
            ),
            auth_provider: "supabase",
            password_hash: null,
          }));
    if (!account) return invalid();
    if (!data.user.email_confirmed_at) return invalid();
    const verified = await createSupabaseAdminClient()
      .from("app_accounts")
      .update({ verified_at: data.user.email_confirmed_at })
      .eq("id", data.user.id);
    if (verified.error) throw verified.error;
    if (verifyType === "recovery") {
      const ticket = await issueAccountToken(String(account.id), "reset");
      const response = redirect(new URL("/reset-password", origin));
      response.headers.append(
        "set-cookie",
        `${RECOVERY_COOKIE}=${ticket.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
      );
      return response;
    }
    const session = await createAccountSession(String(account.id));
    const response = redirect(new URL("/spaces", origin));
    response.headers.append(
      "set-cookie",
      accountCookieHeader(session.token, session.expiresAt),
    );
    return response;
  } catch {
    return invalid();
  }
}
