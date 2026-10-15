import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  assertSameOrigin,
  dataErrorResponse,
  invalidInput,
  parseRequestBody,
  parseUuid,
  requireActiveSpaceMember,
} from "@/lib/data/api";
import { requireConversationAccess } from "@/lib/data/conversations";
import {
  listMessages,
  parseMessageCursor,
  sendMessage,
  sendMessageSchema,
} from "@/lib/data/messages";

type Context = { params: Promise<{ conversationId: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    const { conversationId } = await context.params;
    parseUuid(conversationId);
    const db = createSupabaseAdminClient();
    const { data: target, error: targetError } = await db
      .from("conversations")
      .select("space_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return invalidInput("会话不存在");
    const { member, spaceId } = await requireActiveSpaceMember(
      db,
      target.space_id,
    );
    await requireConversationAccess(db, spaceId, conversationId, member.id);
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .safeParse(request.nextUrl.searchParams.get("limit") ?? 50);
    if (!limit.success) return invalidInput("每页消息数量必须为 1–100");
    const cursor = parseMessageCursor(
      request.nextUrl.searchParams.get("cursor"),
    );
    const result = await listMessages(db, conversationId, cursor, limit.data);
    const { data: members } = await db
      .from("conversation_members")
      .select("member_id")
      .eq("conversation_id", conversationId);
    const { data: reads } = await db
      .from("conversation_reads")
      .select("member_id,last_read_at")
      .eq("conversation_id", conversationId);
    const otherMembers = new Set(
      (members ?? [])
        .map((row) => row.member_id)
        .filter((id) => id !== member.id),
    );
    const readTimes = (reads ?? [])
      .filter((row) => otherMembers.has(row.member_id))
      .map((row) => new Date(row.last_read_at).getTime());
    return NextResponse.json({
      ...result,
      messages: result.messages.map((message) => ({
        ...message,
        readByOthers:
          message.sender_id === member.id &&
          readTimes.some(
            (time) => time >= new Date(message.server_created_at).getTime(),
          ),
      })),
    });
  } catch (error) {
    return dataErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const { conversationId } = await context.params;
    parseUuid(conversationId);
    const db = createSupabaseAdminClient();
    const { data: target, error: targetError } = await db
      .from("conversations")
      .select("space_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return invalidInput("会话不存在");
    const { member, spaceId } = await requireActiveSpaceMember(
      db,
      target.space_id,
    );
    await requireConversationAccess(db, spaceId, conversationId, member.id);
    const input = await parseRequestBody(request, sendMessageSchema);
    const result = await sendMessage(db, conversationId, member.id, input);
    return NextResponse.json(
      { message: result.message },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return dataErrorResponse(error);
  }
}
