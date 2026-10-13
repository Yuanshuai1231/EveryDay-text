import { NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { ERROR_CODES, errorResponse } from "@/lib/auth/validation";
import {
  assertSameOrigin,
  dataErrorResponse,
  parseUuid,
  requireActiveSpaceMember,
} from "@/lib/data/api";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ spaceId: string }> },
) {
  try {
    assertSameOrigin(request);
    const spaceId = parseUuid((await context.params).spaceId);
    const db = createSupabaseAdminClient();
    const { session } = await requireActiveSpaceMember(db, spaceId);
    const { error } = await db.rpc("remove_space_member", {
      p_space_id: spaceId,
      p_actor_id: session.member_id,
      p_target_id: session.member_id,
    });
    if (error) {
      if (error.message.includes("CREATOR_TRANSFER_REQUIRED"))
        return errorResponse(
          ERROR_CODES.CREATOR_TRANSFER_REQUIRED,
          "请先将空间转交给其他成员，再退出空间",
          409,
        );
      if (error.code === "42501")
        return errorResponse(ERROR_CODES.FORBIDDEN, "你已不在这个空间中", 403);
      throw error;
    }
    if (!session.account_id) await clearSessionCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return dataErrorResponse(error);
  }
}
