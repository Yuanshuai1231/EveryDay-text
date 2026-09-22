import { z } from "zod";
import { hasSameOrigin } from "@/lib/auth/origin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getCurrentSession } from "@/lib/auth/session";
import { ERROR_CODES, errorResponse, type ErrorCode } from "@/lib/auth/validation";

export type DataClient = SupabaseClient<Database>;
export const uuidSchema = z.string().uuid();
export const timestampSchema = z.iso.datetime({ offset: true });

export class DataApiError extends Error {
  constructor(public code: ErrorCode, message: string, public status: number) { super(message); }
}

export function invalidInput(message = "请求内容无效，请检查后重试"): never {
  throw new DataApiError(ERROR_CODES.INVALID_INPUT, message, 400);
}

export function dataErrorResponse(error: unknown) {
  if (error instanceof DataApiError) return errorResponse(error.code, error.message, error.status);
  return errorResponse(ERROR_CODES.INTERNAL, "服务暂时不可用，请稍后重试", 500);
}

export function assertSameOrigin(request: Request) {
  if (!hasSameOrigin(request)) {
    throw new DataApiError(ERROR_CODES.FORBIDDEN, "无法接受来自其他网站的操作", 403);
  }
}

export async function parseRequestBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try { body = await request.json(); } catch { return invalidInput("请求格式无效"); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return invalidInput();
  return parsed.data;
}

export function parseUuid(value: string) {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) return invalidInput("资源标识无效");
  return parsed.data;
}

export async function requireActiveSpaceMember(db: DataClient, spaceId?: string) {
  const session = await getCurrentSession(db);
  if (!session || session.revoked_at || session.member_removed_at || Date.parse(session.expires_at) <= Date.now()) {
    throw new DataApiError(ERROR_CODES.UNAUTHORIZED, "会话已失效，请重新加入空间", 401);
  }
  if (!session.space_id || (spaceId && session.space_id !== spaceId)) {
    throw new DataApiError(ERROR_CODES.FORBIDDEN, "无权访问该空间", 403);
  }
  const { data: member, error } = await db.from("members").select("id,space_id,nickname,removed_at").eq("id", session.member_id).eq("space_id", session.space_id).is("removed_at", null).maybeSingle();
  if (error) throw error;
  if (!member) throw new DataApiError(ERROR_CODES.FORBIDDEN, "你已不在这个空间中", 403);
  return { session, member, spaceId: session.space_id };
}
