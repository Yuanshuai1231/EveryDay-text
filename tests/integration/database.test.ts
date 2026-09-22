// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { applyMigrations } from "@/lib/local/database";
import { makeLocalFetch } from "@/lib/local/fetch";

let db:PGlite;
beforeAll(async()=>{db=new PGlite();await db.waitReady;await applyMigrations(db);},60000);
afterAll(async()=>{await db?.close();});
describe("actual PostgreSQL constraints and local transport",()=>{
  it("creates a space atomically and denies anonymous reads",async()=>{
    const client=createClient("http://local.test","test",{auth:{persistSession:false},global:{fetch:makeLocalFetch(async()=>db)}});
    const {data,error}=await client.rpc("create_space_with_member",{
      p_name:"测试小组",p_nickname:"小熊",p_timezone:"Asia/Shanghai",
      p_invite_hash:"a".repeat(64),p_token_digest:"b".repeat(64),p_expires_at:"2030-01-01T00:00:00Z",
    });
    expect(error).toBeNull();expect(data).toHaveLength(1);
    const result=data[0];
    const member=await client.from("members").select("*").eq("id",result.member_id).single();
    expect(member.error).toBeNull();expect(member.data.nickname).toBe("小熊");
    const denied=await db.transaction(async tx=>{
      await tx.exec("GRANT SELECT ON public.members TO anon; SET LOCAL ROLE anon");
      return tx.query("SELECT * FROM public.members");
    });
    expect(denied.rows).toHaveLength(0);
    const count=await db.query<{count:number}>("select count(*)::int as count from public.members");
    await expect(db.query("select * from public.join_space_by_invite($1,$2,$3,$4)",["x".repeat(64),"陌生人","c".repeat(64),"2030-01-01"])).rejects.toThrow();
    expect((await db.query<{count:number}>("select count(*)::int as count from public.members")).rows[0].count).toBe(count.rows[0].count);
  });
  it("rejects impossible timezone and rolls back failed creation",async()=>{
    const before=await db.query<{count:number}>("select count(*)::int as count from public.spaces");
    await expect(db.query("select * from public.create_space_with_member($1,$2,$3,$4,$5,$6)",["fail","nick","Foo/Bar","d".repeat(64),"e".repeat(64),"2030-01-01"])).rejects.toThrow();
    expect((await db.query<{count:number}>("select count(*)::int as count from public.spaces")).rows[0].count).toBe(before.rows[0].count);
  });
});
