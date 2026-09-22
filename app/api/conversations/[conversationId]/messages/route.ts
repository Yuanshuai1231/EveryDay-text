import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { assertSameOrigin, dataErrorResponse, invalidInput, parseRequestBody, parseUuid, requireActiveSpaceMember } from "@/lib/data/api";
import { requireConversationAccess } from "@/lib/data/conversations";
import { listMessages, parseMessageCursor, sendMessage, sendMessageSchema } from "@/lib/data/messages";

type Context = { params: Promise<{ conversationId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { conversationId } = await context.params;
    parseUuid(conversationId);
    const db = createSupabaseAdminClient();
    const { member, spaceId } = await requireActiveSpaceMember(db);
    await requireConversationAccess(db, spaceId, conversationId, member.id);
    const limit = z.coerce.number().int().min(1).max(100).safeParse(request.nextUrl.searchParams.get("limit") ?? 50);
    if (!limit.success) return invalidInput("每页消息数量必须为 1–100");
    const cursor = parseMessageCursor(request.nextUrl.searchParams.get("cursor"));
    return NextResponse.json(await listMessages(db, conversationId, cursor, limit.data));
  } catch (error) { return dataErrorResponse(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const { conversationId } = await context.params;
    parseUuid(conversationId);
    const db = createSupabaseAdminClient();
    const { member, spaceId } = await requireActiveSpaceMember(db);
    await requireConversationAccess(db, spaceId, conversationId, member.id);
    const input = await parseRequestBody(request, sendMessageSchema);
    const result = await sendMessage(db, conversationId, member.id, input);
    return NextResponse.json({ message: result.message }, { status: result.created ? 201 : 200 });
  } catch (error) { return dataErrorResponse(error); }
}
