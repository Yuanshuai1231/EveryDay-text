import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/auth/accounts";
import { hasSameOrigin } from "@/lib/auth/origin";
import {
  ERROR_CODES,
  errorResponse,
  updateSpaceSchema,
} from "@/lib/auth/validation";
import {
  assertSameOrigin,
  dataErrorResponse,
  parseUuid,
  requireActiveSpaceMember,
  uuidSchema,
} from "@/lib/data/api";
import { clearSessionCookie } from "@/lib/auth/session";
import { isGroupAvatarId } from "@/lib/spaces/catalog";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  try {
    assertSameOrigin(request);
    const spaceId = parseUuid((await context.params).spaceId);
    const db = createSupabaseAdminClient();
    const { session } = await requireActiveSpaceMember(db, spaceId);
    const { error } = await db.rpc("delete_space", {
      p_space_id: spaceId,
      p_actor_id: session.member_id,
    });
    if (error) {
      if (error.code === "42501")
        return errorResponse(ERROR_CODES.FORBIDDEN, "仅创建者可删除空间", 403);
      throw error;
    }
    if (!session.account_id) await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return dataErrorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
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
  const { spaceId } = await context.params;
  if (!uuidSchema.safeParse(spaceId).success)
    return errorResponse(ERROR_CODES.INVALID_INPUT, "空间标识无效", 400);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(ERROR_CODES.INVALID_INPUT, "请求格式无效", 400);
  }
  const parsed = updateSpaceSchema.safeParse(body);
  if (
    !parsed.success ||
    (parsed.data.avatarId !== undefined &&
      !isGroupAvatarId(parsed.data.avatarId))
  )
    return errorResponse(ERROR_CODES.INVALID_INPUT, "空间名称或头像无效", 400);
  try {
    const { data, error } = await db.rpc("update_account_space", {
      p_space_id: spaceId,
      p_account_id: account.user.id,
      p_name: parsed.data.name,
      p_avatar_id: parsed.data.avatarId ?? null,
    });
    const space = Array.isArray(data) ? data[0] : data;
    if (error || !space) {
      if (error?.code === "42501")
        return errorResponse(
          ERROR_CODES.FORBIDDEN,
          "仅创建者可修改空间设置",
          403,
        );
      return errorResponse(
        error?.code === "22023"
          ? ERROR_CODES.INVALID_INPUT
          : ERROR_CODES.INTERNAL,
        error?.code === "22023"
          ? "空间名称无效"
          : "空间服务暂时不可用，请稍后重试",
        error?.code === "22023" ? 400 : 503,
      );
    }
    return Response.json({
      space: {
        id: space.id,
        name: space.name,
        avatar_id: space.avatar_id,
        timezone: space.timezone,
      },
    });
  } catch {
    return errorResponse(
      ERROR_CODES.INTERNAL,
      "空间服务暂时不可用，请稍后重试",
      503,
    );
  }
}
