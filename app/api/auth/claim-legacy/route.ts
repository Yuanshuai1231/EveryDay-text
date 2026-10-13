import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getCurrentAccount } from "@/lib/auth/accounts";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { digestToken } from "@/lib/auth/token";
import { authRequestGuard, rateLimitedResponse } from "@/lib/auth/request";

export async function POST(request: NextRequest) {
  const guard = authRequestGuard(request);
  if (!guard.allowed)
    return guard.status === 429
      ? rateLimitedResponse(guard.retryAfter)
      : Response.json(
          { error: { code: "FORBIDDEN", message: "请求来源不允许" } },
          { status: 403 },
        );
  try {
    const client = createSupabaseAdminClient();
    const account = await getCurrentAccount(client);
    const legacyToken = (await cookies()).get("daily_member_session")?.value;
    if (!account || !legacyToken || legacyToken.length > 256)
      return Response.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "请登录账号，并在原浏览器中绑定小组",
          },
        },
        { status: 401 },
      );
    const { data: legacy, error } = await client
      .from("member_sessions")
      .select("id,member_id,expires_at,revoked_at")
      .eq("token_digest", digestToken(legacyToken))
      .maybeSingle();
    if (
      error ||
      !legacy ||
      legacy.revoked_at ||
      new Date(legacy.expires_at).getTime() <= Date.now()
    )
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "原小组会话已失效" } },
        { status: 401 },
      );
    const member = await client
      .from("members")
      .select("id,space_id,removed_at")
      .eq("id", legacy.member_id)
      .maybeSingle();
    if (member.error || !member.data || member.data.removed_at)
      return Response.json(
        { error: { code: "FORBIDDEN", message: "小组成员身份已失效" } },
        { status: 403 },
      );
    const { data: claimed, error: claimError } = await client.rpc(
      "claim_legacy_membership",
      {
        p_account_id: account.user.id,
        p_member_id: legacy.member_id,
        p_legacy_session_id: legacy.id,
        p_account_session_id: account.session.id,
      },
    );
    if (claimError || !claimed)
      return Response.json(
        { error: { code: "FORBIDDEN", message: "无法绑定这个小组身份" } },
        { status: 403 },
      );
    const selected = await client
      .from("account_sessions")
      .update({ selected_space_id: member.data.space_id })
      .eq("id", account.session.id)
      .is("revoked_at", null);
    if (selected.error) throw selected.error;
    const response = Response.json({
      message: "已绑定原小组身份",
      spaceId: member.data.space_id,
    });
    response.headers.append(
      "set-cookie",
      `daily_member_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
    return response;
  } catch {
    return Response.json(
      { error: { code: "FORBIDDEN", message: "无法绑定这个小组身份" } },
      { status: 403 },
    );
  }
}
