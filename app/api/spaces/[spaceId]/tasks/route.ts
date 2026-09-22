import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { isValidWorkDate } from "@/lib/data/checkins";
import { assertSameOrigin, dataErrorResponse, invalidInput, parseRequestBody, parseUuid, requireActiveSpaceMember } from "@/lib/data/api";
import { createTask, createTaskSchema, listTasks } from "@/lib/data/tasks";

type Context = { params: Promise<{ spaceId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { spaceId } = await context.params;
    parseUuid(spaceId);
    const db = createSupabaseAdminClient();
    await requireActiveSpaceMember(db, spaceId);
    const date = request.nextUrl.searchParams.get("date");
    if (!isValidWorkDate(date)) return invalidInput("请选择有效日期");
    return NextResponse.json({ tasks: await listTasks(db, spaceId, date) });
  } catch (error) { return dataErrorResponse(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const { spaceId } = await context.params;
    parseUuid(spaceId);
    const db = createSupabaseAdminClient();
    const { member } = await requireActiveSpaceMember(db, spaceId);
    const input = await parseRequestBody(request, createTaskSchema);
    return NextResponse.json({ task: await createTask(db, spaceId, member.id, input) }, { status: 201 });
  } catch (error) { return dataErrorResponse(error); }
}
