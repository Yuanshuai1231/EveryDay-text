import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { ERROR_CODES, errorResponse } from "@/lib/auth/validation";
import { hasSameOrigin, isObject, isValidWorkDate } from "@/lib/data/checkins";

export async function GET(request: NextRequest, context: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await context.params; const db = createSupabaseAdminClient(); const session = await getCurrentSession(db);
  if (!session) return errorResponse(ERROR_CODES.UNAUTHORIZED, "会话已失效", 401); if (session.space_id !== spaceId) return errorResponse(ERROR_CODES.FORBIDDEN, "无权访问该空间", 403);
  const date = request.nextUrl.searchParams.get("date") ?? ""; if (!isValidWorkDate(date)) return errorResponse(ERROR_CODES.INVALID_INPUT, "日期无效", 400);
  const { data, error } = await db.from("daily_checkins").select("*").eq("space_id", spaceId).eq("work_date", date);
  if (error) return errorResponse(ERROR_CODES.INTERNAL, "无法读取完成状态", 500); return NextResponse.json({ date, checkins: data ?? [] });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ spaceId: string }> }) {
  if (!hasSameOrigin(request)) return errorResponse(ERROR_CODES.FORBIDDEN, "请求来源无效", 403);
  const { spaceId } = await context.params; const db = createSupabaseAdminClient(); const session = await getCurrentSession(db);
  if (!session) return errorResponse(ERROR_CODES.UNAUTHORIZED, "会话已失效", 401); if (session.space_id !== spaceId) return errorResponse(ERROR_CODES.FORBIDDEN, "无权访问该空间", 403);
  let body: unknown; try { body = await request.json(); } catch { return errorResponse(ERROR_CODES.INVALID_INPUT, "请求格式无效", 400); }
  if (!isObject(body)) return errorResponse(ERROR_CODES.INVALID_INPUT, "请求格式无效", 400);
  const date = body.date; if (!isValidWorkDate(date)) return errorResponse(ERROR_CODES.INVALID_INPUT, "日期无效", 400);
  const { data, error } = await db.from("daily_checkins").upsert({ space_id: spaceId, member_id: session.member_id, work_date: date, checked_in_at: new Date().toISOString() }, { onConflict: "space_id,member_id,work_date" }).select().single();
  if (error) return errorResponse(ERROR_CODES.INTERNAL, "无法完成打卡", 500); return NextResponse.json({ checkin: data });
}
