import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
export type AccountSpacesClient = SupabaseClient<Database>;
export type SpaceMembership = {
  id: string;
  name: string;
  avatar_id: string | null;
  timezone: string;
  memberId: string;
  role: "creator" | "member";
  memberCount: number;
};
export async function listAccountSpaces(
  db: AccountSpacesClient,
  accountId: string,
): Promise<SpaceMembership[]> {
  const { data: members, error: memberError } = await db
    .from("members")
    .select("id,space_id,role")
    .eq("account_id", accountId)
    .is("removed_at", null)
    .order("joined_at");
  if (memberError) throw memberError;
  const active = members ?? [];
  if (!active.length) return [];
  const ids = active.map((m) => m.space_id);
  const [
    { data: spaces, error: spaceError },
    { data: counts, error: countError },
  ] = await Promise.all([
    db.from("spaces").select("id,name,avatar_id,timezone").in("id", ids),
    db
      .from("members")
      .select("space_id")
      .in("space_id", ids)
      .is("removed_at", null),
  ]);
  if (spaceError) throw spaceError;
  if (countError) throw countError;
  const byCount = new Map<string, number>();
  for (const m of counts ?? [])
    byCount.set(m.space_id, (byCount.get(m.space_id) ?? 0) + 1);
  const byId = new Map((spaces ?? []).map((s) => [s.id, s]));
  return active.flatMap((m) => {
    const s = byId.get(m.space_id);
    return s
      ? [
          {
            id: s.id,
            name: s.name,
            avatar_id: s.avatar_id,
            timezone: s.timezone,
            memberId: m.id,
            role: m.role,
            memberCount: byCount.get(s.id) ?? 0,
          },
        ]
      : [];
  });
}
export async function getAccountMembership(
  db: AccountSpacesClient,
  accountId: string,
  spaceId: string,
  activeOnly = true,
) {
  let q = db
    .from("members")
    .select("id,space_id,role,removed_at,nickname,account_id")
    .eq("account_id", accountId)
    .eq("space_id", spaceId);
  if (activeOnly) q = q.is("removed_at", null);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  return data;
}
