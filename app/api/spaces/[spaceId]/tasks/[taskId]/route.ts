import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { assertSameOrigin, dataErrorResponse, invalidInput, parseRequestBody, parseUuid, requireActiveSpaceMember, timestampSchema } from "@/lib/data/api";
import { deleteTask, updateTask, updateTaskSchema } from "@/lib/data/tasks";

type Context = { params: Promise<{ spaceId: string; taskId: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const { spaceId, taskId } = await context.params;
    parseUuid(spaceId); parseUuid(taskId);
    const db = createSupabaseAdminClient();
    const { member } = await requireActiveSpaceMember(db, spaceId);
    const input = await parseRequestBody(request, updateTaskSchema);
    return NextResponse.json({ task: await updateTask(db, spaceId, taskId, member.id, input) });
  } catch (error) { return dataErrorResponse(error); }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const { spaceId, taskId } = await context.params;
    parseUuid(spaceId); parseUuid(taskId);
    const db = createSupabaseAdminClient();
    const { member } = await requireActiveSpaceMember(db, spaceId);
    const version = timestampSchema.safeParse(request.nextUrl.searchParams.get("updatedAt"));
    if (!version.success) return invalidInput("缺少任务版本，请刷新后重试");
    await deleteTask(db, spaceId, taskId, member.id, version.data);
    return NextResponse.json({ ok: true });
  } catch (error) { return dataErrorResponse(error); }
}
