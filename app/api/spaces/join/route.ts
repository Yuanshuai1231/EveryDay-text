import { hasSameOrigin } from "@/lib/auth/origin";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { digestInviteCode } from "@/lib/auth/token";
import {
  accountJoinSpaceSchema,
  ERROR_CODES,
  errorResponse,
} from "@/lib/auth/validation";
import { requireAccount } from "@/lib/auth/accounts";
import { joinRateLimiter } from "@/lib/auth/rate-limit";
export async function POST(request: NextRequest) {
  if (!hasSameOrigin(request))
    return errorResponse(ERROR_CODES.FORBIDDEN, "请求来源无效", 403);
  let db;
  try {
    db = createSupabaseAdminClient();
  } catch {
    return errorResponse(
      ERROR_CODES.INTERNAL,
      "空间服务暂时不可用，请稍后重试",
      503,
    );
  }
  let account;
  try {
    account = await requireAccount(db);
  } catch (e) {
    return e instanceof Error &&
      (e as Error & { status?: number }).status === 401
      ? errorResponse(ERROR_CODES.UNAUTHORIZED, "请先登录", 401)
      : errorResponse(
          ERROR_CODES.INTERNAL,
          "空间服务暂时不可用，请稍后重试",
          503,
        );
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const accountLimit = joinRateLimiter.check(`join:account:${account.user.id}`);
  const ipLimit = joinRateLimiter.check(`join:ip:${ip}`);
  const limit = accountLimit.allowed ? ipLimit : accountLimit;
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
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return errorResponse(ERROR_CODES.INVALID_INPUT, "请求格式无效", 400);
  }
  const parsed = accountJoinSpaceSchema.safeParse(input);
  if (!parsed.success)
    return errorResponse(ERROR_CODES.INVALID_INVITE, "邀请码无效", 400);
  try {
    const { data, error } = await db.rpc("join_account_space", {
      p_account_id: account.user.id,
      p_invite_hash: digestInviteCode(parsed.data.inviteCode),
      p_nickname: parsed.data.nickname ?? null,
    });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result) {
      if (error) console.error("account space join failed", error);
      if (error?.code === "P0001")
        return errorResponse(
          ERROR_CODES.INVALID_INVITE,
          "邀请码无效或已失效",
          400,
        );
      if (error?.code === "23505")
        return errorResponse(ERROR_CODES.CONFLICT, "昵称已被使用", 409);
      return errorResponse(
        error?.code === "22023"
          ? ERROR_CODES.INVALID_INPUT
          : ERROR_CODES.INTERNAL,
        error?.code === "22023" ? "昵称无效" : "空间服务暂时不可用，请稍后重试",
        error?.code === "22023" ? 400 : 503,
      );
    }
    return NextResponse.json(
      {
        spaceId: result.space_id,
        memberId: result.member_id,
        joined: result.joined !== false,
      },
      { status: result.joined === false ? 200 : 201 },
    );
  } catch {
    return errorResponse(
      ERROR_CODES.INTERNAL,
      "空间服务暂时不可用，请稍后重试",
      503,
    );
  }
}
