import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { localDateInTimeZone } from "./checkins";
import { listTasks } from "./tasks";

export async function spaceSummary(spaceId:string,memberId:string,date?:string){
 const db=createSupabaseAdminClient();
 const spaceResult=await db.from("spaces").select("id,name,avatar_id,timezone,creator_member_id").eq("id",spaceId).single();
 if(spaceResult.error)throw spaceResult.error;
 const space=spaceResult.data;
 const day=date??localDateInTimeZone(new Date(),space.timezone);
 const results=await Promise.all([
  db.from("members").select("id,nickname,role,avatar_color,avatar_id,joined_at,removed_at").eq("space_id",spaceId).order("joined_at"),
  listTasks(db,spaceId,day).then(data=>({data,error:null})),
  db.from("daily_logs").select("*").eq("space_id",spaceId).eq("work_date",day),
  db.from("daily_checkins").select("*").eq("space_id",spaceId).eq("work_date",day),
  db.from("daily_checkins").select("work_date").eq("space_id",spaceId).eq("member_id",memberId).order("work_date",{ascending:false}).limit(366),
 ]);
 for(const result of results)if(result.error)throw result.error;
 const members=results[0].data??[],tasks=results[1].data??[],logs=results[2].data??[],checkins=results[3].data??[],history=results[4].data??[];
 const member=members.find(m=>m.id===memberId);
 const completedDates=new Set(history.map(item=>item.work_date));
 let streak=0;const cursor=new Date(localDateInTimeZone(new Date(),space.timezone)+"T12:00:00Z");
 if(!completedDates.has(cursor.toISOString().slice(0,10)))cursor.setUTCDate(cursor.getUTCDate()-1);
 while(completedDates.has(cursor.toISOString().slice(0,10))){streak++;cursor.setUTCDate(cursor.getUTCDate()-1);}
 const names=new Map(members.map(m=>[m.id,m.nickname]));
 const groupTasks=tasks.filter(t=>t.scope==="group");
 const activity=[
  ...checkins.map(c=>({id:c.id,memberId:c.member_id,nickname:names.get(c.member_id)??"已离开成员",text:"完成了今日打卡",time:c.checked_in_at,type:"checkin"})),
  ...tasks.filter(t=>t.completed).map(t=>{const completedBy=t.scope==="group"?t.assignee_id??"":t.creator_id;return {id:t.id,memberId:completedBy,nickname:names.get(completedBy)??"已离开成员",text:"完成了「"+t.title+"」",time:t.completed_at??t.updated_at,type:"task"};}),
  ...tasks.filter(t=>!t.completed).map(t=>({id:t.id,memberId:t.creator_id,nickname:names.get(t.creator_id)??"已离开成员",text:"更新了「"+t.title+"」",time:t.updated_at,type:"task"})),
 ].sort((a,b)=>String(b.time).localeCompare(String(a.time))).slice(0,12);
 return {space,member,members,date:day,tasks,logs,checkins,activity,stats:{
  checkedIn:checkins.filter(c=>members.some(m=>m.id===c.member_id&&!m.removed_at)).length,
  totalMembers:members.filter(m=>!m.removed_at).length,completedTasks:groupTasks.filter(t=>t.completed).length,totalTasks:groupTasks.length,streak,
 }};
}
