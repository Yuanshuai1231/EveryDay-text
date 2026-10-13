import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { hasSameOrigin } from "@/lib/auth/origin";
import { digestInviteCode, generateInviteCode } from "@/lib/auth/token";
import {
  accountCreateSpaceSchema,
  ERROR_CODES,
  errorResponse,
} from "@/lib/auth/validation";
import { requireAccount } from "@/lib/auth/accounts";
import { isGroupAvatarId } from "@/lib/spaces/catalog";
import { listAccountSpaces } from "@/lib/data/account-spaces";
import { spaceCreateRateLimiter } from "@/lib/auth/rate-limit";
const authError = (e: unknown) =>
  e instanceof Error && (e as Error & { status?: number }).status === 401
    ? errorResponse(ERROR_CODES.UNAUTHORIZED, "请先登录", 401)
    : null;
export async function GET() {
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
  try {
    const account = await requireAccount(db);
    return NextResponse.json({
      spaces: await listAccountSpaces(db, account.user.id),
      user: account.user,
    });
  } catch (e) {
    return (
      authError(e) ??
      errorResponse(ERROR_CODES.INTERNAL, "空间服务暂时不可用，请稍后重试", 503)
    );
  }
}
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
    return (
      authError(e) ??
      errorResponse(ERROR_CODES.INTERNAL, "空间服务暂时不可用，请稍后重试", 503)
    );
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const accountLimit = spaceCreateRateLimiter.check(
    `create:account:${account.user.id}`,
  );
  const ipLimit = spaceCreateRateLimiter.check(`create:ip:${ip}`);
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
  const parsed = accountCreateSpaceSchema.safeParse(input);
  if (
    !parsed.success ||
    (parsed.data.avatarId !== undefined &&
      !isGroupAvatarId(parsed.data.avatarId))
  )
    return errorResponse(ERROR_CODES.INVALID_INPUT, "空间名称或头像无效", 400);
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const inviteCode = generateInviteCode();
      const { data, error } = await db.rpc("create_account_space", {
        p_account_id: account.user.id,
        p_name: parsed.data.name,
        p_timezone: parsed.data.timezone ?? "Asia/Shanghai",
        p_invite_hash: digestInviteCode(inviteCode),
        p_avatar_id: parsed.data.avatarId ?? null,
        p_nickname: account.user.nickname,
      });
      if (
        error?.code === "23505" &&
        error.message.includes("spaces_invite_hash_unique")
      )
        continue;
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result) {
        const status =
          error?.code === "23514" || error?.code === "22023"
            ? 400
            : error?.code === "23505"
              ? 409
              : 503;
        return errorResponse(
          status === 409
            ? ERROR_CODES.CONFLICT
            : status === 400
              ? ERROR_CODES.INVALID_INPUT
              : ERROR_CODES.INTERNAL,
          status === 409
            ? "空间名称已存在"
            : status === 400
              ? "空间参数无效"
              : "空间服务暂时不可用，请稍后重试",
          status,
        );
      }
      return NextResponse.json(
        { spaceId: result.space_id, memberId: result.member_id, inviteCode },
        { status: 201 },
      );
    }
  } catch {
    return errorResponse(
      ERROR_CODES.INTERNAL,
      "空间服务暂时不可用，请稍后重试",
      503,
    );
  }
  return errorResponse(ERROR_CODES.INTERNAL, "无法创建空间，请重试", 503);
}
