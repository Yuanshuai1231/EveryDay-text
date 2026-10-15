import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  assertSameOrigin,
  dataErrorResponse,
  parseUuid,
  requireActiveSpaceMember,
} from "@/lib/data/api";
import { requireConversationAccess } from "@/lib/data/conversations";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
) {
  try {
    assertSameOrigin(request);
    const { conversationId } = await context.params;
    parseUuid(conversationId);
    const db = createSupabaseAdminClient();
    const { data: target, error } = await db
      .from("conversations")
      .select("space_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) throw error;
    if (!target)
      return NextResponse.json(
        { error: { message: "会话不存在" } },
        { status: 404 },
      );
    const { member, spaceId } = await requireActiveSpaceMember(
      db,
      target.space_id,
    );
    await requireConversationAccess(db, spaceId, conversationId, member.id);
    const result = await db
      .from("conversation_reads")
      .upsert({
        conversation_id: conversationId,
        member_id: member.id,
        last_read_at: new Date().toISOString(),
      });
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dataErrorResponse(error);
  }
}
