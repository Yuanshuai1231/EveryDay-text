import { getCurrentAccount } from "@/lib/auth/accounts";
import { getCurrentSession } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { digestToken } from "@/lib/auth/token";

export async function GET() {
  try {
    const client = createSupabaseAdminClient();
    const account = await getCurrentAccount(client);
    const session = await getCurrentSession(client);
    let legacySpace: { id: string; name: string; nickname: string } | null =
      null;
    const legacyToken = (await cookies()).get("daily_member_session")?.value;
    if (legacyToken && legacyToken.length <= 256) {
      const legacy = await client
        .from("member_sessions")
        .select("member_id,expires_at,revoked_at")
        .eq("token_digest", digestToken(legacyToken))
        .maybeSingle();
      if (
        legacy.data &&
        !legacy.error &&
        !legacy.data.revoked_at &&
        new Date(legacy.data.expires_at).getTime() > Date.now()
      ) {
        const member = await client
          .from("members")
          .select("space_id,nickname,account_id,removed_at")
          .eq("id", legacy.data.member_id)
          .maybeSingle();
        if (
          member.data &&
          !member.error &&
          !member.data.removed_at &&
          !member.data.account_id
        ) {
          const space = await client
            .from("spaces")
            .select("id,name")
            .eq("id", member.data.space_id)
            .maybeSingle();
          if (space.data && !space.error)
            legacySpace = { ...space.data, nickname: member.data.nickname };
        }
      }
    }
    return Response.json(
      {
        user: account?.user ?? null,
        spaceId: session?.space_id ?? null,
        legacySpace,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { user: null, spaceId: null, legacySpace: null },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
