// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import { applyMigrations } from "@/lib/local/database";
import { makeLocalFetch } from "@/lib/local/fetch";
import { listTasks } from "@/lib/data/tasks";
import type { DataClient } from "@/lib/data/api";
import { GET, POST } from "@/app/api/spaces/[spaceId]/tasks/route";
import { PATCH, DELETE } from "@/app/api/spaces/[spaceId]/tasks/[taskId]/route";

const auth = vi.hoisted(() => ({ current: null as Record<string, unknown> | null, db: null as DataClient | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: async () => auth.current }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => auth.db }));
const day = "2026-10-13";
const migrationName = "20261013000800_personal_group_tasks.sql";
type Task = { id: string; updated_at: string; creator_id: string; scope: string; assignee_id: string | null };
let db: PGlite, space: string, alice: string, bob: string, charlie: string, outsider: string;
let legacyIds: string[], legacyBefore: unknown[];
function actor(memberId: string) { auth.current = { member_id: memberId, space_id: space, expires_at: "2099-01-01T00:00:00Z", revoked_at: null, member_removed_at: null }; }
function request(method: string, body?: unknown, query = "") {
  return new NextRequest("http://localhost/tasks" + query, { method, headers: { origin: "http://localhost", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const context = () => ({ params: Promise.resolve({ spaceId: space }) });
const itemContext = (task: Task) => ({ params: Promise.resolve({ spaceId: space, taskId: task.id }) });
async function create(input: Record<string, unknown> = {}): Promise<Task> {
  const response = await POST(request("POST", { title: "阅读目标", targetDate: day, ...input }), context());
  expect(response.status).toBe(201);
  return (await response.json()).task;
}
async function group(input: Record<string, unknown> = {}) { return create({ scope: "group", assigneeId: bob, ...input }); }
async function patch(task: Task, changes: Record<string, unknown>) { return PATCH(request("PATCH", { updatedAt: task.updated_at, ...changes }), itemContext(task)); }
async function remove(task: Task, date?: string) { return DELETE(request("DELETE", undefined, `?updatedAt=${encodeURIComponent(task.updated_at)}${date ? "&date=" + date : ""}`), itemContext(task)); }
async function list(query = "") { const response = await GET(request("GET", undefined, `?date=${day}${query}`), context()); expect(response.status).toBe(200); return (await response.json()).tasks as Task[]; }

beforeAll(async () => {
  db = new PGlite(); await db.waitReady;
  // Seed an actual pre-008 database, including history from a departed author.
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create publication supabase_realtime; create table _app_migrations(name text primary key)");
  for (const name of (await readdir("supabase/migrations")).filter(name => name.endsWith(".sql") && name < migrationName).sort()) {
    await db.exec((await readFile("supabase/migrations/" + name, "utf8")).replace(/create extension if not exists pgcrypto;/gi, ""));
    await db.query("insert into _app_migrations(name) values($1)", [name]);
  }
  const legacy = (await db.query<{ space_id: string; member_id: string }>("select * from create_space_with_member($1,$2,$3,$4,$5,$6)", ["历史", "旧成员", "Asia/Shanghai", "1".repeat(64), "2".repeat(64), "2030-01-01"])).rows[0];
  legacyIds = (await db.query<{ id: string }>("insert into tasks(space_id,creator_id,title,notes,target_date,completed,completed_on,completed_at) values($1,$2,'旧未完成','保留完整内容','2026-10-12',false,null,null),($1,$2,'旧已完成','完成历史','2026-10-12',true,'2026-10-13','2026-10-13T02:00:00Z') returning id", [legacy.space_id, legacy.member_id])).rows.map(row => row.id);
  legacyBefore = (await db.query("select id,creator_id,title,notes,target_date,completed,completed_on,completed_at,updated_at from tasks where id=any($1::uuid[]) order by id", [legacyIds])).rows;
  await db.query("update members set removed_at=now() where id=$1", [legacy.member_id]);
  await applyMigrations(db);
  const created = (await db.query<{ space_id: string; member_id: string }>("select * from create_space_with_member($1,$2,$3,$4,$5,$6)", ["任务空间", "Alice", "Asia/Shanghai", "a".repeat(64), "b".repeat(64), "2030-01-01"])).rows[0];
  space = created.space_id; alice = created.member_id;
  bob = (await db.query<{ member_id: string }>("select * from join_space_by_invite($1,$2,$3,$4)", ["a".repeat(64), "Bob", "c".repeat(64), "2030-01-01"])).rows[0].member_id;
  charlie = (await db.query<{ member_id: string }>("select * from join_space_by_invite($1,$2,$3,$4)", ["a".repeat(64), "Charlie", "d".repeat(64), "2030-01-01"])).rows[0].member_id;
  outsider = (await db.query<{ member_id: string }>("select * from create_space_with_member($1,$2,$3,$4,$5,$6)", ["另一空间", "外部成员", "Asia/Shanghai", "e".repeat(64), "f".repeat(64), "2030-01-01"])).rows[0].member_id;
  auth.db = createClient("http://local.test", "test", { auth: { persistSession: false }, global: { fetch: makeLocalFetch(async () => db) } }) as DataClient;
}, 60000);
beforeEach(async () => {
  await db.query("update members set removed_at=null where space_id=$1", [space]);
  await db.query("delete from tasks where space_id=$1", [space]);
  actor(alice);
});
afterAll(async () => { await db?.close(); });

describe("personal checklists and fixed group assignments", () => {
  it("classifies existing history as personal without rewriting or duplicating rows", async () => {
    expect((await db.query("select id,creator_id,title,notes,target_date,completed,completed_on,completed_at,updated_at from tasks where id=any($1::uuid[]) order by id", [legacyIds])).rows).toEqual(legacyBefore);
    expect((await db.query("select scope,assignee_id from tasks where id=any($1::uuid[])", [legacyIds])).rows).toEqual([{ scope: "personal", assignee_id: null }, { scope: "personal", assignee_id: null }]);
  });
  it("defaults new and legacy positional RPC calls to personal", async () => {
    expect(await create()).toMatchObject({ scope: "personal", assignee_id: null, creator_id: alice });
    const result = await db.query<{ create_owned_task: Task }>("select create_owned_task($1,$2,'旧调用','',$3,'once')", [space, alice, day]);
    expect(result.rows[0].create_owned_task).toMatchObject({ scope: "personal", assignee_id: null });
  });
  it("lets every active member assign one active member in the same space", async () => {
    actor(charlie);
    expect(await group()).toMatchObject({ scope: "group", creator_id: charlie, assignee_id: bob });
    expect(await group({ assigneeId: charlie })).toMatchObject({ creator_id: charlie, assignee_id: charlie });
  });
  it("filters by scope and assignee while keeping unfiltered API compatibility", async () => {
    const personal = await create(), assignedBob = await group(), assignedAlice = await group({ assigneeId: alice });
    expect((await list()).map(task => task.id)).toEqual([personal.id, assignedBob.id, assignedAlice.id]);
    expect((await list("&scope=personal")).map(task => task.id)).toEqual([personal.id]);
    expect((await list("&scope=group")).map(task => task.id)).toEqual([assignedBob.id, assignedAlice.id]);
    expect((await list("&scope=group&assigneeId=" + bob)).map(task => task.id)).toEqual([assignedBob.id]);
    expect((await listTasks(auth.db!, space, day)).map(task => task.id)).toEqual([personal.id, assignedBob.id, assignedAlice.id]);
  });
  it("rejects invalid filters and invalid assignment payloads", async () => {
    for (const query of ["&scope=other", "&assigneeId=bad"]) expect((await GET(request("GET", undefined, "?date=" + day + query), context())).status).toBe(400);
    for (const input of [{ scope: "other" }, { scope: "group" }, { scope: "personal", assigneeId: bob }, { assigneeId: bob }, { scope: "group", assigneeId: "bad" }]) {
      expect((await POST(request("POST", { title: "无效分配", targetDate: day, ...input }), context())).status).toBe(400);
    }
    expect(await list()).toEqual([]);
  });
  it("rejects cross-space, nonexistent and departed assignees transactionally", async () => {
    await db.query("update members set removed_at=now() where id=$1", [bob]);
    for (const assigneeId of [outsider, bob, "00000000-0000-4000-8000-000000000000"]) {
      const response = await POST(request("POST", { title: "无效负责人", targetDate: day, scope: "group", assigneeId }), context());
      expect(response.status).toBe(400);
      expect((await response.json()).error.message).toBe("只能选择本小组中未退出的成员作为负责人");
    }
    expect(await list()).toEqual([]);
  });
  it("gives completion to the assignee and content/deletion to the author", async () => {
    const task = await group();
    expect((await patch(task, { completed: true, date: day })).status).toBe(403);
    actor(charlie);
    expect((await patch(task, { completed: true, date: day })).status).toBe(403);
    expect((await patch(task, { title: "其他人修改" })).status).toBe(403);
    actor(bob);
    expect((await patch(task, { title: "负责人修改", completed: true, date: day })).status).toBe(403);
    expect((await remove(task)).status).toBe(403);
    const completedResponse = await patch(task, { completed: true, date: day }); expect(completedResponse.status).toBe(200);
    const completed = (await completedResponse.json()).task;
    actor(alice);
    const editedResponse = await patch(completed, { title: "作者编辑", notes: "目标内容" }); expect(editedResponse.status).toBe(200);
    const edited = (await editedResponse.json()).task;
    expect(edited).toMatchObject({ completed: true, assignee_id: bob, title: "作者编辑" });
    expect((await patch(edited, { completed: false, date: day })).status).toBe(403);
    actor(bob);
    const reopenedResponse = await patch(edited, { completed: false, date: day }); expect(reopenedResponse.status).toBe(200);
    actor(alice);
    expect((await remove((await reopenedResponse.json()).task)).status).toBe(200);
  });
  it("keeps personal completion and edits restricted to its creator", async () => {
    const task = await create(); actor(bob);
    expect((await patch(task, { completed: true, date: day })).status).toBe(403);
    expect((await patch(task, { title: "改写个人" })).status).toBe(403);
    actor(alice); expect((await patch(task, { completed: true, date: day })).status).toBe(200);
  });
  it("keeps scope and assignee immutable through HTTP, RPC and direct SQL", async () => {
    const task = await group();
    for (const changes of [{ scope: "personal" }, { assigneeId: alice }]) expect((await patch(task, changes)).status).toBe(400);
    for (const changes of [{ scope: "personal" }, { assignee_id: alice }, { assigneeId: alice }]) {
      const result = await auth.db!.rpc("update_owned_task", { p_space_id: space, p_member_id: alice, p_task_id: task.id, p_updated_at: task.updated_at, p_changes: changes });
      expect(result.error?.code).toBe("22023");
    }
    await expect(db.query("update tasks set assignee_id=$1 where id=$2", [alice, task.id])).rejects.toThrow("TASK_ASSIGNMENT_FIXED");
    await expect(db.query("update tasks set scope='personal',assignee_id=null where id=$1", [task.id])).rejects.toThrow("TASK_ASSIGNMENT_FIXED");
  });
  it("keeps daily states independent and accepts one mutation per series version", async () => {
    const task = await group({ recurrence: "daily" }); actor(bob);
    expect((await patch(task, { completed: true })).status).toBe(400);
    expect((await patch(task, { completed: true, date: "2026-10-12" })).status).toBe(400);
    const responses = await Promise.all([patch(task, { completed: true, date: day }), patch(task, { completed: true, date: "2026-10-14" })]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await db.query("select * from task_completions where task_id=$1 and completed", [task.id])).rows).toHaveLength(1);
    const updated = (await responses.find(response => response.status === 200)!.json()).task;
    const date = updated.occurrence_date;
    const otherDate = date === day ? "2026-10-14" : day;
    expect((await listTasks(auth.db!, space, otherDate))[0]).toMatchObject({ completed: false });
    const response = await patch(updated, { completed: true, date: otherDate }); expect(response.status).toBe(200);
    expect((await listTasks(auth.db!, space, date))[0]).toMatchObject({ completed: true });
    expect((await listTasks(auth.db!, space, otherDate))[0]).toMatchObject({ completed: true });
  });
  it("preserves once history and does not create personal records or daily check-ins", async () => {
    const task = await group(); actor(bob);
    const response = await patch(task, { completed: true, date: "2026-10-15" }); expect(response.status).toBe(200);
    expect((await listTasks(auth.db!, space, "2026-10-14", "group"))[0]).toMatchObject({ completed: false, overdue: true });
    expect((await listTasks(auth.db!, space, "2026-10-15", "group"))[0]).toMatchObject({ completed: true });
    expect(await listTasks(auth.db!, space, "2026-10-16", "group")).toEqual([]);
    expect(await list("&scope=personal")).toEqual([]);
    expect((await db.query("select * from tasks where space_id=$1", [space])).rows).toHaveLength(1);
    expect((await db.query("select * from daily_checkins where space_id=$1", [space])).rows).toHaveLength(0);
  });
  it("lets the author stop a daily group series and retains completion history", async () => {
    const task = await group({ recurrence: "daily" }); actor(bob);
    const completed = (await (await patch(task, { completed: true, date: day })).json()).task;
    expect((await remove(completed, "2026-10-14")).status).toBe(403);
    actor(alice); expect((await remove(completed, "2026-10-14")).status).toBe(200);
    expect((await list("&scope=group"))[0]).toMatchObject({ completed: true, ends_on: day });
    expect(await listTasks(auth.db!, space, "2026-10-14", "group")).toEqual([]);
    expect((await db.query("select * from task_completions where task_id=$1", [task.id])).rows).toHaveLength(1);
  });
  it("allows an active assignee to complete and reopen after the author leaves", async () => {
    actor(bob); const daily = await group({ assigneeId: alice, recurrence: "daily" }), once = await group({ assigneeId: alice });
    await db.query("select remove_space_member($1,$2,$3)", [space, alice, bob]); actor(alice);
    for (const task of [daily, once]) {
      const response = await patch(task, { completed: true, date: day }); expect(response.status).toBe(200);
      expect((await patch((await response.json()).task, { completed: false, date: day })).status).toBe(200);
      expect((await patch((await list()).find(item => item.id === task.id)!, { title: "接管内容" })).status).toBe(403);
    }
  });
  it("blocks completion after the assignee leaves but preserves history and author edits", async () => {
    const task = await group({ recurrence: "daily" }); actor(bob);
    const completed = (await (await patch(task, { completed: true, date: day })).json()).task;
    await db.query("select remove_space_member($1,$2,$3)", [space, alice, bob]);
    const result = await auth.db!.rpc("update_owned_task", { p_space_id: space, p_member_id: bob, p_task_id: task.id, p_updated_at: completed.updated_at, p_changes: { completed: false, date: day } });
    expect(result.error?.code).toBe("42501");
    await expect(db.query("update task_completions set completed=false,completed_at=null where task_id=$1", [task.id])).rejects.toThrow("TASK_MEMBER_INACTIVE");
    actor(alice); expect((await list())[0]).toMatchObject({ completed: true, assignee_id: bob });
    expect((await patch(completed, { title: "作者仍可编辑" })).status).toBe(200);
    expect((await db.query("select * from task_completions where task_id=$1 and completed", [task.id])).rows).toHaveLength(1);
  });
  it("rechecks assignee membership inside the transaction after route authorization", async () => {
    const task = await group({ recurrence: "daily" }); actor(bob);
    const client = auth.db!;
    auth.db = { from: client.from.bind(client), rpc: async (...args: Parameters<typeof client.rpc>) => { await db.query("update members set removed_at=now() where id=$1", [bob]); return client.rpc(...args); } } as unknown as DataClient;
    try { expect((await patch(task, { completed: true, date: day })).status).toBe(403); } finally { auth.db = client; }
    expect((await db.query("select * from task_completions where task_id=$1", [task.id])).rows).toHaveLength(0);
  });
  it("allows the active author to save unchanged metadata after the assignee leaves", async () => {
    const task = await group();
    await db.query("select remove_space_member($1,$2,$3)", [space, alice, bob]);
    const response = await patch(task, { title: "阅读目标", notes: "", targetDate: day, recurrence: "once" });
    expect(response.status).toBe(200);
    expect((await response.json()).task).toMatchObject({ id: task.id, updated_at: task.updated_at, completed: false });
  });
  it("rechecks assignment at creation if its member leaves after authorization", async () => {
    const client = auth.db!;
    auth.db = { from: client.from.bind(client), rpc: async (...args: Parameters<typeof client.rpc>) => { await db.query("update members set removed_at=now() where id=$1", [bob]); return client.rpc(...args); } } as unknown as DataClient;
    try { expect((await POST(request("POST", { title: "退出竞态", targetDate: day, scope: "group", assigneeId: bob }), context())).status).toBe(400); } finally { auth.db = client; }
    expect(await list()).toEqual([]);
  });
  it("preserves space deletion cascades for group history from departed members", async () => {
    actor(bob); const task = await group({ recurrence: "daily", assigneeId: charlie }); actor(charlie);
    expect((await patch(task, { completed: true, date: day })).status).toBe(200);
    await db.query("select remove_space_member($1,$2,$3)", [space, alice, bob]);
    await db.query("select remove_space_member($1,$2,$3)", [space, alice, charlie]);
    // Roll back this destructive operation to retain the per-suite fixture.
    await expect(db.transaction(async tx => {
      expect((await tx.query<{ delete_space: boolean }>("select delete_space($1,$2)", [space, alice])).rows[0].delete_space).toBe(true);
      expect((await tx.query("select * from tasks where space_id=$1", [space])).rows).toHaveLength(0);
      expect((await tx.query("select * from task_completions where space_id=$1", [space])).rows).toHaveLength(0);
      throw new Error("ROLLBACK_FIXTURE");
    })).rejects.toThrow("ROLLBACK_FIXTURE");
  });
});
