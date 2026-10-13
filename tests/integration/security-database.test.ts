// @vitest-environment node
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "@/lib/local/database";
let db:PGlite;let a:{space_id:string;member_id:string};let b:{space_id:string;member_id:string};
beforeAll(async()=>{
 db=new PGlite();await db.waitReady;await applyMigrations(db);
 a=(await db.query<{space_id:string;member_id:string}>("select * from create_space_with_member($1,$2,$3,$4,$5,$6)",["小组A","A","Asia/Shanghai","a".repeat(64),"b".repeat(64),"2030-01-01"])).rows[0];
 b=(await db.query<{space_id:string;member_id:string}>("select * from create_space_with_member($1,$2,$3,$4,$5,$6)",["小组B","B","Asia/Shanghai","c".repeat(64),"d".repeat(64),"2030-01-01"])).rows[0];
},60000);
afterAll(async()=>{await db?.close();});
describe("PostgreSQL access boundaries",()=>{
 for(const role of ["anon","authenticated"]){
  it(role+" cannot read business tables or sessions even with table grants",async()=>{
   await db.transaction(async tx=>{
    await tx.exec("GRANT SELECT ON ALL TABLES IN SCHEMA public TO "+role+"; SET LOCAL ROLE "+role);
    for(const table of ["spaces","members","member_sessions","tasks","task_completions","daily_logs","daily_checkins","conversations","conversation_members","messages"]){
     expect((await tx.query("SELECT * FROM "+table)).rows).toHaveLength(0);
    }
   });
  });
 }
 for(const role of ["anon","authenticated"]){
  it(role+" cannot invoke task mutation transactions",async()=>{
   await expect(db.transaction(async tx=>{
    await tx.exec("SET LOCAL ROLE "+role);
    await tx.query("select create_owned_task($1,$2,'forbidden','','2026-10-13','once')",[a.space_id,a.member_id]);
   })).rejects.toThrow("permission denied for function create_owned_task");
  });
 }
 it("rejects cross-space member attachment",async()=>{
  await expect(db.query("insert into daily_logs(space_id,member_id,work_date,slot,content) values ($1,$2,'2026-09-22','morning','bad')",[a.space_id,b.member_id])).rejects.toThrow();
 });
 it("owner protection and removal run as transactions",async()=>{
  await expect(db.query("select remove_space_member($1,$2,$3)",[a.space_id,a.member_id,a.member_id])).rejects.toThrow("CREATOR_TRANSFER_REQUIRED");
  const joined=(await db.query<{member_id:string}>("select * from join_space_by_invite($1,$2,$3,$4)",["a".repeat(64),"小兔","e".repeat(64),"2030-01-01"])).rows[0];
  await expect(db.query("select remove_space_member($1,$2,$3)",[a.space_id,b.member_id,joined.member_id])).rejects.toThrow();
  await db.query("select remove_space_member($1,$2,$3)",[a.space_id,a.member_id,joined.member_id]);
  const session=await db.query<{revoked_at:unknown}>("select revoked_at from member_sessions where member_id=$1",[joined.member_id]);
  expect(session.rows[0].revoked_at).not.toBeNull();
  expect((await db.query("select * from conversation_members where member_id=$1",[joined.member_id])).rows).toHaveLength(0);
  await expect(db.query("insert into tasks(space_id,creator_id,title,target_date) values($1,$2,'late write','2026-09-22')",[a.space_id,joined.member_id])).rejects.toThrow("no longer an active member");
  await expect(db.query("insert into daily_logs(space_id,member_id,work_date,slot) values($1,$2,'2026-09-22','morning')",[a.space_id,joined.member_id])).rejects.toThrow("no longer an active member");
 });
 it("failed join leaves no partial member or session",async()=>{
  const count=(await db.query<{n:number}>("select count(*)::int n from members")).rows[0].n;
  await expect(db.query("select * from join_space_by_invite($1,$2,$3,$4)",["a".repeat(64),"重复令牌","b".repeat(64),"2030-01-01"])).rejects.toThrow();
  expect((await db.query<{n:number}>("select count(*)::int n from members")).rows[0].n).toBe(count);
 });
});
