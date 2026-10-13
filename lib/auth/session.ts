import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { digestToken, generateToken } from "./token";
import { ACCOUNT_COOKIE } from "./accounts";
export { ACCOUNT_COOKIE } from "./accounts";

export const SESSION_COOKIE = "daily_member_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export type SessionRecord = {
  id: string;
  member_id: string;
  space_id: string;
  member_role: "creator" | "member";
  expires_at: string;
  revoked_at: string | null;
  last_active_at?: string;
  member_removed_at: string | null;
  account_id?: string;
  selected_space_id?: string | null;
};
export function isSessionUsable(
  session: Pick<
    SessionRecord,
    "expires_at" | "revoked_at" | "member_removed_at"
  >,
  now = new Date(),
) {
  return (
    !session.revoked_at &&
    !session.member_removed_at &&
    new Date(session.expires_at).getTime() > now.getTime()
  );
}
export async function createMemberSession(
  client: SupabaseClient,
  memberId: string,
  now = new Date(),
) {
  const token = generateToken();
  const expiresAt = new Date(
    now.getTime() + SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  const { error } = await client.from("member_sessions").insert({
    member_id: memberId,
    token_digest: digestToken(token),
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { token, expiresAt };
}
export async function setSessionCookie(token: string, expiresAt?: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt ? new Date(expiresAt) : undefined,
  });
}
export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
export async function revokeSession(client: SupabaseClient, sessionId: string) {
  const { error } = await client
    .from("member_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sessionId)
    .is("revoked_at", null);
  if (error) throw error;
}
export async function revokeMemberSessions(
  client: SupabaseClient,
  memberId: string,
) {
  const { error } = await client
    .from("member_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("member_id", memberId)
    .is("revoked_at", null);
  if (error) throw error;
}
async function resolveAccountSession(
  token: string,
  client: SupabaseClient,
  spaceId?: string,
): Promise<SessionRecord | null> {
  if (!token || token.length > 256) return null;
  const { data: accountSession, error } = await client
    .from("account_sessions")
    .select("*")
    .eq("token_digest", digestToken(token))
    .maybeSingle();
  if (
    error ||
    !accountSession ||
    accountSession.revoked_at ||
    new Date(accountSession.expires_at).getTime() <= Date.now()
  )
    return null;
  const accountId = String(accountSession.account_id);
  const accountQuery = await client
    .from("app_accounts")
    .select("id,verified_at")
    .eq("id", accountId)
    .maybeSingle();
  if (accountQuery.error || !accountQuery.data?.verified_at) return null;
  const selected = spaceId ?? accountSession.selected_space_id ?? undefined;
  const membersQuery = await client
    .from("members")
    .select("*")
    .eq("account_id", accountId)
    .is("removed_at", null);
  if (membersQuery.error) return null;
  const members = (membersQuery.data ?? []) as Array<Record<string, unknown>>;
  const member = spaceId
    ? members.find((item) => item.space_id === spaceId)
    : selected
      ? (members.find((item) => item.space_id === selected) ?? members[0])
      : members[0];
  if (!member) return null;
  const result = {
    id: accountSession.id,
    member_id: (member?.id as string) ?? "",
    space_id: (member?.space_id as string) ?? selected ?? "",
    member_role: (member?.role as "creator" | "member") ?? "member",
    member_removed_at: (member?.removed_at as string | null) ?? null,
    expires_at: accountSession.expires_at,
    revoked_at: accountSession.revoked_at,
    last_active_at: accountSession.last_active_at,
    account_id: accountId,
    selected_space_id: accountSession.selected_space_id ?? null,
  } as SessionRecord;
  if (Date.now() - Date.parse(accountSession.last_active_at) > 300000)
    await client
      .from("account_sessions")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", accountSession.id);
  return result;
}

export async function resolveSession(
  token: string | undefined,
  client: SupabaseClient = createSupabaseAdminClient(),
  spaceId?: string,
): Promise<SessionRecord | null> {
  if (!token || token.length > 256) return null;
  const accountEntry = await client
    .from("account_sessions")
    .select("id")
    .eq("token_digest", digestToken(token))
    .maybeSingle();
  if (accountEntry.error) return null;
  if (accountEntry.data) return resolveAccountSession(token, client, spaceId);
  const { data: session, error } = await client
    .from("member_sessions")
    .select("*")
    .eq("token_digest", digestToken(token))
    .maybeSingle();
  if (error || !session) return null;
  const { data: member, error: memberError } = await client
    .from("members")
    .select("*")
    .eq("id", session.member_id)
    .maybeSingle();
  if (memberError || !member || member.account_id) return null;
  const result = {
    ...session,
    space_id: member.space_id,
    member_role: member.role,
    member_removed_at: member.removed_at,
  } as SessionRecord;
  if (!isSessionUsable(result)) return null;
  if (Date.now() - Date.parse(session.last_active_at) > 300000) {
    await client
      .from("member_sessions")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", session.id);
  }
  return result;
}
export async function getCurrentSession(
  client: SupabaseClient = createSupabaseAdminClient(),
  spaceId?: string,
) {
  const cookieStore = await cookies();
  const accountCookie = cookieStore.get(ACCOUNT_COOKIE)?.value;
  if (accountCookie !== undefined)
    return resolveAccountSession(accountCookie, client, spaceId);
  return resolveSession(
    cookieStore.get(SESSION_COOKIE)?.value,
    client,
    spaceId,
  );
}
