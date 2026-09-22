import { hasSameOrigin } from "@/lib/auth/origin";
import { NextRequest } from "next/server";
import { clearSessionCookie,getCurrentSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
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


