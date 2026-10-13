import { hasSameOrigin } from "@/lib/auth/origin";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { SESSION_TTL_SECONDS, setSessionCookie } from "@/lib/auth/session";
import {
  digestInviteCode,
  digestToken,
  generateInviteCode,
  generateToken,
} from "@/lib/auth/token";
import {
  createSpaceSchema,
  ERROR_CODES,
  errorResponse,
} from "@/lib/auth/validation";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return errorResponse(ERROR_CODES.FORBIDDEN, "请求来源无效", 403);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return errorResponse(ERROR_CODES.INVALID_INPUT, "请求格式无效", 400);
  }
  const parsed = createSpaceSchema.safeParse(input);
  if (!parsed.success)
    return errorResponse(ERROR_CODES.INVALID_INPUT, "空间名或昵称无效", 400);
  try {
    const db = createSupabaseAdminClient();
    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_SECONDS * 1000,
    ).toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const inviteCode = generateInviteCode();
      const { data, error } = await db.rpc("create_space_with_member", {
        p_name: parsed.data.name,
        p_nickname: parsed.data.nickname,
        p_timezone: parsed.data.timezone ?? "Asia/Shanghai",
        p_invite_hash: digestInviteCode(inviteCode),
        p_token_digest: digestToken(token),
        p_expires_at: expiresAt,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (
        error?.code === "23505" &&
        error.message.includes("spaces_invite_hash_unique")
      )
        continue;
      if (error || !result) {
        console.error("space creation failed", error);
        return errorResponse(
          ERROR_CODES.INTERNAL,
          "空间服务暂时不可用，请稍后重试",
          503,
        );
      }
      await setSessionCookie(token, expiresAt);
      return NextResponse.json(
        { spaceId: result.space_id, memberId: result.member_id, inviteCode },
        { status: 201 },
      );
    }
    return errorResponse(ERROR_CODES.INTERNAL, "无法创建空间，请重试", 503);
  } catch (error) {
    console.error("space creation failed", error);
    return errorResponse(
      ERROR_CODES.INTERNAL,
      "空间服务暂时不可用，请稍后重试",
      503,
    );
  }
}
