import { hasSameOrigin } from "@/lib/auth/origin";
import { NextRequest } from "next/server";
import { clearSessionCookie,getCurrentSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { z } from "zod";
import { isAvatarId, type AvatarId } from "@/lib/avatars/catalog";
import { assertSameOrigin, DataApiError, dataErrorResponse, parseRequestBody, parseUuid, requireActiveSpaceMember } from "@/lib/data/api";
import { ERROR_CODES } from "@/lib/auth/validation";
export async function DELETE(request:NextRequest,context:{params:Promise<{spaceId:string;memberId:string}>}){

 if(!hasSameOrigin(request))return Response.json({error:{message:"请求来源无效"}},{status:403});
 const {spaceId,memberId}=await context.params;
 const db=createSupabaseAdminClient();const session=await getCurrentSession(db);
 if(!session||session.space_id!==spaceId)return Response.json({error:{message:"会话已失效"}},{status:401});
 const {error}=await db.rpc("remove_space_member",{p_space_id:spaceId,p_actor_id:session.member_id,p_target_id:memberId});
 if(error){
  const creator=error.message.includes("CREATOR_TRANSFER_REQUIRED");
  return Response.json({error:{code:creator?"CREATOR_TRANSFER_REQUIRED":"FORBIDDEN",message:creator?"请先将空间转交给其他成员":"无权移除此成员"}},{status:creator?409:403});
 }
 if(memberId===session.member_id)await clearSessionCookie();
 return Response.json({ok:true});
}

const avatarSchema = z.object({ avatarId: z.custom<AvatarId>(isAvatarId) });

export async function PATCH(request: NextRequest, context: { params: Promise<{ spaceId: string; memberId: string }> }) {
  try {
    assertSameOrigin(request);
    const params = await context.params;
    const spaceId = parseUuid(params.spaceId), memberId = parseUuid(params.memberId);
    const db = createSupabaseAdminClient();
    const { session } = await requireActiveSpaceMember(db, spaceId);
    if (memberId !== session.member_id) throw new DataApiError(ERROR_CODES.FORBIDDEN, "只能修改自己的头像", 403);
    const { avatarId } = await parseRequestBody(request, avatarSchema);
    const { data: member, error } = await db.from("members")
      .update({ avatar_id: avatarId }).eq("space_id", spaceId).eq("id", memberId).is("removed_at", null)
      .select("id,nickname,role,avatar_color,avatar_id").maybeSingle();
    if (error) throw error;
    if (!member) throw new DataApiError(ERROR_CODES.FORBIDDEN, "你已不在这个空间中", 403);
    return Response.json({ member });
  } catch (error) {
    return dataErrorResponse(error);
  }
}


