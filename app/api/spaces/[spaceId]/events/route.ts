import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveSession,SESSION_COOKIE } from "@/lib/auth/session";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,context:{params:Promise<{spaceId:string}>}){
 const {spaceId}=await context.params;
 const db=createSupabaseAdminClient(),token=request.cookies.get(SESSION_COOKIE)?.value;
 const session=await resolveSession(token,db);
 if(!session||session.space_id!==spaceId)return Response.json({error:{message:"会话已失效"}},{status:401});
 let stopped=false;let timer:ReturnType<typeof setTimeout>|undefined;
 const encoder=new TextEncoder();
 const stream=new ReadableStream<Uint8Array>({
  start(controller){
   let last="";let ticks=0;
   const send=(event:string,data:unknown)=>{if(!stopped)controller.enqueue(encoder.encode("event: "+event+"\ndata: "+JSON.stringify(data)+"\n\n"));};
   const close=()=>{if(!stopped){stopped=true;if(timer)clearTimeout(timer);controller.close();}};
   request.signal.addEventListener("abort",close,{once:true});
   const poll=async()=>{
    if(stopped)return;
    try{
     const current=await resolveSession(token,db);
     if(!current||current.space_id!==spaceId){send("revoked",{});close();return;}
     const c=await db.from("conversation_members").select("conversation_id").eq("member_id",session.member_id);
     const ids=(c.data??[]).map(row=>row.conversation_id);
     const result=await Promise.all([
      db.from("members").select("id,removed_at,role,avatar_id").eq("space_id",spaceId).order("id"),
      db.from("tasks").select("id,updated_at").eq("space_id",spaceId).order("id"),
      db.from("daily_logs").select("id,edited_at").eq("space_id",spaceId).order("id"),
      db.from("daily_checkins").select("id,checked_in_at").eq("space_id",spaceId).order("id"),
      ids.length?db.from("messages").select("id").in("conversation_id",ids).order("server_created_at",{ascending:false}).limit(1):Promise.resolve({data:[],error:null}),
     ]);
     if(result.some(r=>r.error))throw new Error("sync failed");
     const hash=createHash("sha256").update(JSON.stringify(result.map(r=>r.data))).digest("hex");
     if(hash!==last){last=hash;send("update",{at:Date.now()});}
     else if(++ticks%10===0)send("heartbeat",{});
    }catch{send("retry",{message:"正在重新连接"});}
    if(!stopped)timer=setTimeout(poll,2000);
   };
   void poll();
  },
  cancel(){stopped=true;if(timer)clearTimeout(timer);}
 });
 return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}});
}

