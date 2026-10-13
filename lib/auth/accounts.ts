import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { digestToken, generateToken } from "./token";
const ACCOUNT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export const ACCOUNT_COOKIE = "daily_account_session";
export const RECOVERY_COOKIE = "daily_account_recovery";
export function accountCookieHeader(token: string, expiresAt: string) {
  return `${ACCOUNT_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export type PublicAccount = {
  id: string;
  email: string;
  nickname: string;
  avatar_id: string | null;
};
export type AccountSession = {
  id: string;
  account_id: string;
  selected_space_id: string | null;
  expires_at: string;
  revoked_at: string | null;
};
export type CurrentAccount = { user: PublicAccount; session: AccountSession };

type Client = SupabaseClient;
function db(client?: Client): Client {
  return client ?? createSupabaseAdminClient();
}
export function accountPublic(row: Record<string, unknown>): PublicAccount {
  return {
    id: String(row.id),
    email: String(row.email),
    nickname: String(row.nickname),
    avatar_id: (row.avatar_id as string | null) ?? null,
  };
}

export async function getAccountByEmail(email: string, client?: Client) {
  const { data, error } = await db(client)
    .from("app_accounts")
    .select("*")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}
export async function getAccountById(id: string, client?: Client) {
  const { data, error } = await db(client)
    .from("app_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}
export async function createAccount(
  input: {
    email: string;
    nickname: string;
    password_hash?: string | null;
    auth_provider?: "local" | "supabase";
    id?: string;
  },
  client?: Client,
) {
  const { data, error } = await db(client)
    .from("app_accounts")
    .insert({
      ...input,
      email: input.email.trim().toLowerCase(),
      auth_provider: input.auth_provider ?? "local",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}
export async function createAccountSession(
  accountId: string,
  selectedSpaceId: string | null = null,
  client?: Client,
) {
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + ACCOUNT_SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  const { data, error } = await db(client)
    .from("account_sessions")
    .insert({
      account_id: accountId,
      token_digest: digestToken(token),
      selected_space_id: selectedSpaceId,
      expires_at: expiresAt,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { token, expiresAt, session: data as AccountSession };
}
export async function revokeAccountSessions(
  accountId: string,
  client?: Client,
) {
  const { error } = await db(client)
    .from("account_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .is("revoked_at", null);
  if (error) throw error;
}
export async function getCurrentAccount(
  client?: Client,
): Promise<CurrentAccount | null> {
  const cookieValue = (await cookies()).get(ACCOUNT_COOKIE)?.value;
  if (!cookieValue || cookieValue.length > 256) return null;
  const { data: session, error } = await db(client)
    .from("account_sessions")
    .select("*")
    .eq("token_digest", digestToken(cookieValue))
    .maybeSingle();
  if (
    error ||
    !session ||
    session.revoked_at ||
    new Date(session.expires_at).getTime() <= Date.now()
  )
    return null;
  const { data: account, error: accountError } = await db(client)
    .from("app_accounts")
    .select("*")
    .eq("id", session.account_id)
    .maybeSingle();
  if (accountError || !account || !account.verified_at) return null;
  return {
    user: accountPublic(account),
    session: {
      id: session.id,
      account_id: session.account_id,
      selected_space_id: session.selected_space_id ?? null,
      expires_at: session.expires_at,
      revoked_at: session.revoked_at ?? null,
    },
  };
}
export async function requireAccount(client?: Client): Promise<CurrentAccount> {
  const account = await getCurrentAccount(client);
  if (!account) {
    const error = new Error("Unauthorized");
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  return account;
}

export async function issueAccountToken(
  accountId: string,
  purpose: "verify" | "reset",
  client?: Client,
) {
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + (purpose === "verify" ? 24 : 1) * 60 * 60 * 1000,
  ).toISOString();
  const previous = await db(client)
    .from("account_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("account_id", accountId)
    .eq("purpose", purpose)
    .is("used_at", null);
  if (previous.error) throw previous.error;
  const { error } = await db(client)
    .from("account_tokens")
    .insert({
      account_id: accountId,
      token_digest: digestToken(token),
      purpose,
      expires_at: expiresAt,
    });
  if (error) throw error;
  return { token, expiresAt };
}
export async function completePasswordReset(
  token: string,
  passwordHash: string,
  client?: Client,
) {
  if (!token || token.length > 256) return null;
  const { data, error } = await db(client).rpc(
    "complete_account_password_reset",
    { p_token_digest: digestToken(token), p_password_hash: passwordHash },
  );
  if (error) throw error;
  return data as string | null;
}
export async function consumeAccountToken(
  token: string,
  purpose: "verify" | "reset",
  client?: Client,
) {
  if (!token || token.length > 256) return null;
  const { data, error } = await db(client)
    .from("account_tokens")
    .select("*")
    .eq("token_digest", digestToken(token))
    .eq("purpose", purpose)
    .is("used_at", null)
    .maybeSingle();
  if (error || !data || new Date(data.expires_at).getTime() <= Date.now())
    return null;
  const { data: consumed, error: consumeError } = await db(client)
    .from("account_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("used_at", null)
    .select("*")
    .maybeSingle();
  if (consumeError || !consumed) return null;
  return consumed as {
    id: string;
    account_id: string;
    purpose: "verify" | "reset";
    expires_at: string;
  };
}
