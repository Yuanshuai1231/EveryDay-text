import { NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { spaceSummary } from "@/lib/data/space-summary";
import { isValidWorkDate } from "@/lib/data/checkins";
export async function GET(request:NextRequest,context:{params:Promise<{spaceId:string}>}){
 const {spaceId}=await context.params;
 const session=await getCurrentSession();
 if(!session)return Response.json({error:{message:"请先加入空间"}},{status:401});
 if(session.space_id!==spaceId)return Response.json({error:{message:"无权访问"}},{status:403});
 const date=request.nextUrl.searchParams.get("date")??undefined;
 if(date&&!isValidWorkDate(date))return Response.json({error:{message:"日期无效"}},{status:400});
 try{return Response.json(await spaceSummary(spaceId,session.member_id,date));}
 catch{return Response.json({error:{message:"暂时无法读取空间，请重试"}},{status:500});}
}

