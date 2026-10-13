import { hasSameOrigin } from "@/lib/auth/origin";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { SESSION_TTL_SECONDS, setSessionCookie } from "@/lib/auth/session";
import { digestInviteCode, digestToken, generateToken } from "@/lib/auth/token";
import {
  ERROR_CODES,
  errorResponse,
  joinSpaceSchema,
} from "@/lib/auth/validation";
import { joinRateLimiter } from "@/lib/auth/rate-limit";

export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return errorResponse(ERROR_CODES.FORBIDDEN, "请求来源无效", 403);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return errorResponse(ERROR_CODES.INVALID_INPUT, "请求格式无效", 400);
  }
  const parsed = joinSpaceSchema.safeParse(input);
  if (!parsed.success)
    return errorResponse(ERROR_CODES.INVALID_INVITE, "邀请码或昵称无效", 400);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = joinRateLimiter.check(`${ip}:${parsed.data.inviteCode}`);
  if (!limit.allowed)
    return NextResponse.json(
      {
        error: {
          code: ERROR_CODES.RATE_LIMITED,
          message: "请求过于频繁，请稍后再试",
        },
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  try {
    const db = createSupabaseAdminClient();
    const token = generateToken();
    const expiresAt = new Date(
      Date.now() + SESSION_TTL_SECONDS * 1000,
    ).toISOString();
    const { data, error } = await db.rpc("join_space_by_invite", {
      p_invite_hash: digestInviteCode(parsed.data.inviteCode),
      p_nickname: parsed.data.nickname,
      p_token_digest: digestToken(token),
      p_expires_at: expiresAt,
    });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result) {
      console.error("space join failed", error);
      if (
        error?.code === "23505" &&
        error.message.includes("members_active_nickname_unique")
      ) {
        return errorResponse(ERROR_CODES.CONFLICT, "昵称已被使用", 409);
      }
      if (error?.code === "P0001" && error.message === "invalid invite") {
        return errorResponse(
          ERROR_CODES.INVALID_INVITE,
          "邀请码无效或已失效",
          400,
        );
      }
      return errorResponse(
        ERROR_CODES.INTERNAL,
        "空间服务暂时不可用，请稍后重试",
        503,
      );
    }
    await setSessionCookie(token, expiresAt);
    return NextResponse.json(
      { spaceId: result.space_id, memberId: result.member_id },
      { status: 201 },
    );
  } catch (error) {
    console.error("space join failed", error);
    return errorResponse(
      ERROR_CODES.INTERNAL,
      "空间服务暂时不可用，请稍后重试",
      503,
    );
  }
}
