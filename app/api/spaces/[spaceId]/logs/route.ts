import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/session";
import { ERROR_CODES, errorResponse } from "@/lib/auth/validation";
import { hasSameOrigin, isObject, isValidSlot, isValidWorkDate, nextEditedAt } from "@/lib/data/checkins";

async function auth(spaceId: string) {
  const db = createSupabaseAdminClient();
  const session = await getCurrentSession(db, spaceId);
  if (!session) return { db, error: errorResponse(ERROR_CODES.UNAUTHORIZED, "会话已失效", 401) };
  if (session.space_id !== spaceId) return { db, error: errorResponse(ERROR_CODES.FORBIDDEN, "无权访问该空间", 403) };
  return { db, session };
}

export async function GET(request: NextRequest, context: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await context.params;
  const result = await auth(spaceId); if (result.error) return result.error;
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!isValidWorkDate(date)) return errorResponse(ERROR_CODES.INVALID_INPUT, "日期无效", 400);
  const { data: members, error: membersError } = await result.db.from("members").select("id,nickname,avatar_color,avatar_id,role").eq("space_id", spaceId).is("removed_at", null).order("joined_at");
  const { data: logs, error: logsError } = await result.db.from("daily_logs").select("*").eq("space_id", spaceId).eq("work_date", date);
  if (membersError || logsError) return errorResponse(ERROR_CODES.INTERNAL, "无法读取打卡记录", 500);
  return NextResponse.json({ date, members: members ?? [], logs: logs ?? [] });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ spaceId: string }> }) {
  if (!hasSameOrigin(request)) return errorResponse(ERROR_CODES.FORBIDDEN, "请求来源无效", 403);
  const { spaceId } = await context.params;
  const result = await auth(spaceId); if (result.error) return result.error;
  let body: unknown; try { body = await request.json(); } catch { return errorResponse(ERROR_CODES.INVALID_INPUT, "请求格式无效", 400); }
  if (!isObject(body)) return errorResponse(ERROR_CODES.INVALID_INPUT, "请求格式无效", 400);
  const input = body;
  if (!isValidWorkDate(input.date) || !isValidSlot(input.slot) || typeof input.content !== "string" || !(input.editedAt === null || (typeof input.editedAt === "string" && !Number.isNaN(Date.parse(input.editedAt))))) return errorResponse(ERROR_CODES.INVALID_INPUT, "日期、时段或内容无效", 400);
  const content = input.content.trim();
  if (content.length > 5000) return errorResponse(ERROR_CODES.INVALID_INPUT, "内容过长", 400);
  const key = { space_id: spaceId, member_id: result.session.member_id, work_date: input.date, slot: input.slot };
  const now = nextEditedAt(input.editedAt as string | null);
  const saved = input.editedAt === null
    ? await result.db.from("daily_logs").insert({ ...key, content, edited_at: now }).select().single()
    : await result.db.from("daily_logs").update({ content, edited_at: now }).eq("space_id", spaceId).eq("member_id", result.session.member_id).eq("work_date", input.date).eq("slot", input.slot).eq("edited_at", input.editedAt as string).select().maybeSingle();
  const { data, error } = saved;
  if (!data && (!error || error.code === "23505")) {
    const { data: remote } = await result.db.from("daily_logs").select("*").eq("space_id", spaceId).eq("member_id", result.session.member_id).eq("work_date", input.date).eq("slot", input.slot).maybeSingle();
    return NextResponse.json({ error: { code: ERROR_CODES.CONFLICT, message: "记录已被更新" }, local: { content, editedAt: input.editedAt }, remote }, { status: 409 });
  }
  if (error) return errorResponse(ERROR_CODES.INTERNAL, "无法保存打卡记录", 500);
  return NextResponse.json({ log: data });
}
