import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/auth/accounts";
import { hasSameOrigin } from "@/lib/auth/origin";
import { ERROR_CODES, errorResponse } from "@/lib/auth/validation";
import { uuidSchema } from "@/lib/data/api";
export async function POST(
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
  try {
    const { data: member, error: memberError } = await db
      .from("members")
      .select("id")
      .eq("account_id", account.user.id)
      .eq("space_id", spaceId)
      .is("removed_at", null)
      .maybeSingle();
    if (memberError)
      return errorResponse(
        ERROR_CODES.INTERNAL,
        "空间服务暂时不可用，请稍后重试",
        503,
      );
    if (!member)
      return errorResponse(ERROR_CODES.FORBIDDEN, "无权访问该空间", 403);
    const { error } = await db
      .from("account_sessions")
      .update({ selected_space_id: spaceId })
      .eq("id", account.session.id)
      .eq("account_id", account.user.id);
    if (error)
      return errorResponse(
        ERROR_CODES.INTERNAL,
        "空间服务暂时不可用，请稍后重试",
        503,
      );
    return Response.json({ spaceId, memberId: member.id });
  } catch {
    return errorResponse(
      ERROR_CODES.INTERNAL,
      "空间服务暂时不可用，请稍后重试",
      503,
    );
  }
}
