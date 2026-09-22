import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { assertSameOrigin, dataErrorResponse, parseRequestBody, parseUuid, requireActiveSpaceMember } from "@/lib/data/api";
import { listConversations, openConversationSchema, openDirectConversation } from "@/lib/data/conversations";

type Context = { params: Promise<{ spaceId: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try {
    const { spaceId } = await context.params;
    parseUuid(spaceId);
    const db = createSupabaseAdminClient();
    const { member } = await requireActiveSpaceMember(db, spaceId);
    return NextResponse.json({ conversations: await listConversations(db, spaceId, member.id) });
  } catch (error) { return dataErrorResponse(error); }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    assertSameOrigin(request);
    const { spaceId } = await context.params;
    parseUuid(spaceId);
    const db = createSupabaseAdminClient();
    const { member } = await requireActiveSpaceMember(db, spaceId);
    const input = await parseRequestBody(request, openConversationSchema);
    return NextResponse.json({ conversation: await openDirectConversation(db, spaceId, member.id, input.memberId) });
  } catch (error) { return dataErrorResponse(error); }
}
