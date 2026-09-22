import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { digestToken, generateToken } from "./token";

export const SESSION_COOKIE="daily_member_session";
export const SESSION_TTL_SECONDS=60*60*24*30;
export type SessionRecord={
 id:string; member_id:string; space_id:string; member_role:"creator"|"member";
 expires_at:string; revoked_at:string|null; last_active_at?:string; member_removed_at:string|null;
};
export function isSessionUsable(session:Pick<SessionRecord,"expires_at"|"revoked_at"|"member_removed_at">,now=new Date()){
 return !session.revoked_at&&!session.member_removed_at&&new Date(session.expires_at).getTime()>now.getTime();
}
export async function createMemberSession(client:SupabaseClient,memberId:string,now=new Date()){
 const token=generateToken(); const expiresAt=new Date(now.getTime()+SESSION_TTL_SECONDS*1000).toISOString();
 const {error}=await client.from("member_sessions").insert({member_id:memberId,token_digest:digestToken(token),expires_at:expiresAt});
 if(error)throw error; return {token,expiresAt};
}
export async function setSessionCookie(token:string,expiresAt?:string){
 (await cookies()).set(SESSION_COOKIE,token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",expires:expiresAt?new Date(expiresAt):undefined});
}
export async function clearSessionCookie(){
 (await cookies()).set(SESSION_COOKIE,"",{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",path:"/",maxAge:0});
}
export async function revokeSession(client:SupabaseClient,sessionId:string){
 const {error}=await client.from("member_sessions").update({revoked_at:new Date().toISOString()}).eq("id",sessionId).is("revoked_at",null); if(error)throw error;
}
export async function revokeMemberSessions(client:SupabaseClient,memberId:string){
 const {error}=await client.from("member_sessions").update({revoked_at:new Date().toISOString()}).eq("member_id",memberId).is("revoked_at",null); if(error)throw error;
}
export async function resolveSession(token:string|undefined,client:SupabaseClient=createSupabaseAdminClient()):Promise<SessionRecord|null>{
 if(!token||token.length>256)return null;
 const {data:session,error}=await client.from("member_sessions").select("*").eq("token_digest",digestToken(token)).maybeSingle();
 if(error||!session)return null;
 const {data:member,error:memberError}=await client.from("members").select("*").eq("id",session.member_id).maybeSingle();
 if(memberError||!member)return null;
 const result={...session,space_id:member.space_id,member_role:member.role,member_removed_at:member.removed_at} as SessionRecord;
 if(!isSessionUsable(result))return null;
 if(Date.now()-Date.parse(session.last_active_at)>300000){
   await client.from("member_sessions").update({last_active_at:new Date().toISOString()}).eq("id",session.id);
 }
 return result;
}
export async function getCurrentSession(client:SupabaseClient=createSupabaseAdminClient()){
 return resolveSession((await cookies()).get(SESSION_COOKIE)?.value,client);
}

