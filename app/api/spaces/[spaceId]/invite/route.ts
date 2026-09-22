import { hasSameOrigin } from "@/lib/auth/origin";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { digestInviteCode, generateInviteCode } from "@/lib/auth/token";
import { ERROR_CODES, errorResponse } from "@/lib/auth/validation";



export async function POST(request: NextRequest, context: { params: Promise<{ spaceId: string }> }) {
  if (!hasSameOrigin(request)) return errorResponse(ERROR_CODES.FORBIDDEN, "请求来源无效", 403);
  const { spaceId } = await context.params;
  const db = createSupabaseAdminClient();
  const session = await getCurrentSession(db);
  if (!session) return errorResponse(ERROR_CODES.UNAUTHORIZED, "会话已失效", 401);
  if (session.space_id !== spaceId || session.member_role !== "creator") return errorResponse(ERROR_CODES.FORBIDDEN, "仅创建者可轮换邀请码", 403);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inviteCode = generateInviteCode();
    const inviteHash = digestInviteCode(inviteCode);
    const { data: existing } = await db.from("spaces").select("id").eq("invite_code_hash", inviteHash).maybeSingle();
    if (existing) continue;
    const { error } = await db.from("spaces").update({ invite_code_hash: inviteHash, invite_revoked_at: null, invite_rotated_at: new Date().toISOString() }).eq("id", spaceId).eq("creator_member_id", session.member_id);
    if (!error) return NextResponse.json({ spaceId, inviteCode });
  }
  return errorResponse(ERROR_CODES.INTERNAL, "无法生成邀请码", 500);
}

