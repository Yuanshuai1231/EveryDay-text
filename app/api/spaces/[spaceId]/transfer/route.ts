import { hasSameOrigin } from "@/lib/auth/origin";
import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { z } from "zod";
export async function POST(request:NextRequest,context:{params:Promise<{spaceId:string}>}){

 if(!hasSameOrigin(request))return Response.json({error:{message:"请求来源无效"}},{status:403});
 const {spaceId}=await context.params;const db=createSupabaseAdminClient();const session=await getCurrentSession(db,spaceId);
 if(!session||session.space_id!==spaceId)return Response.json({error:{message:"请重新加入空间"}},{status:401});
 const input=z.object({memberId:z.string().uuid()}).safeParse(await request.json().catch(()=>null));
 if(!input.success)return Response.json({error:{message:"请选择接任成员"}},{status:400});
 const {error}=await db.rpc("transfer_space_owner",{p_space_id:spaceId,p_actor_id:session.member_id,p_target_id:input.data.memberId});
 if(error)return Response.json({error:{message:"仅创建者可将空间转交给其他在组成员"}},{status:403});
 return Response.json({ok:true});
}


