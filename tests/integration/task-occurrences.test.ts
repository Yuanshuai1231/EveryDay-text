// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { applyMigrations } from "@/lib/local/database";
import { makeLocalFetch } from "@/lib/local/fetch";
import type { DataClient } from "@/lib/data/api";
import { GET, POST } from "@/app/api/spaces/[spaceId]/tasks/route";
import { PATCH, DELETE } from "@/app/api/spaces/[spaceId]/tasks/[taskId]/route";
import { spaceSummary } from "@/lib/data/space-summary";

const auth = vi.hoisted(() => ({ current: null as Record<string, unknown> | null, db: null as DataClient | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: async () => auth.current }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => auth.db }));
let db: PGlite, space: string, alice: string, bob: string;
const day = "2026-10-13";
function request(method: string, body?: unknown, query = "") {
  return new NextRequest("http://localhost/tasks" + query, { method, headers: { origin: "http://localhost", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const context = () => ({ params: Promise.resolve({ spaceId: space }) });
const itemContext = (id: string) => ({ params: Promise.resolve({ spaceId: space, taskId: id }) });
async function create(recurrence = "once", targetDate = day, notes = "") {
  const response = await POST(request("POST", { title: "阅读", notes, targetDate, recurrence }), context());
  expect(response.status).toBe(201);
  return (await response.json()).task;
}
async function list(date: string) { const response = await GET(request("GET", undefined, "?date=" + date), context()); expect(response.status).toBe(200); return (await response.json()).tasks; }
async function patch(task: { id: string; updated_at: string }, body: Record<string, unknown>) {
  return PATCH(request("PATCH", { updatedAt: task.updated_at, ...body }), itemContext(task.id));
}
beforeAll(async () => {
  db = new PGlite(); await db.waitReady; await applyMigrations(db);
  const created = (await db.query<{ space_id: string; member_id: string }>("select * from create_space_with_member($1,$2,$3,$4,$5,$6)", ["清单", "Alice", "Asia/Shanghai", "a".repeat(64), "b".repeat(64), "2030-01-01"])).rows[0];
  space = created.space_id; alice = created.member_id;
  bob = (await db.query<{ member_id: string }>("select * from join_space_by_invite($1,$2,$3,$4)", ["a".repeat(64), "Bob", "c".repeat(64), "2030-01-01"])).rows[0].member_id;
  auth.db = createClient("http://local.test", "test", { auth: { persistSession: false }, global: { fetch: makeLocalFetch(async () => db) } }) as DataClient;
}, 60000);
beforeEach(async () => {
  await db.query("update members set removed_at=null where id=$1", [bob]);
  await db.exec("delete from tasks; delete from daily_logs; delete from daily_checkins;");
  auth.current = { member_id: alice, space_id: space, expires_at: "2099-01-01T00:00:00Z", revoked_at: null, member_removed_at: null };
});
afterAll(async () => { await db?.close(); });

describe("date-projected checklist with actual PostgreSQL and routes", () => {
  it("carries unfinished once tasks in orange until their completion day, preserving earlier history", async () => {
    const task = await create();
    expect(await list("2026-10-12")).toEqual([]);
    expect(await list("2026-10-14")).toMatchObject([{ id: task.id, recurrence: "once", occurrence_date: "2026-10-14", completed: false, overdue: true }]);
    const response = await patch(task, { completed: true, date: "2026-10-15" });
    expect(response.status).toBe(200);
    const completed = (await response.json()).task;
    expect(completed).toMatchObject({ completed: true, completed_on: "2026-10-15", overdue: false });
    expect(completed.updated_at).not.toBe(task.updated_at);
    expect(await list("2026-10-14")).toMatchObject([{ completed: false, completed_at: null, overdue: true }]);
    expect(await list("2026-10-15")).toMatchObject([{ completed: true, overdue: false }]);
    expect(await list("2026-10-16")).toEqual([]);
    expect((await patch(completed, { completed: false, date: "2026-10-15" })).status).toBe(200);
    expect(await list("2026-10-16")).toMatchObject([{ completed: false, overdue: true }]);
  });
  it("completes daily occurrences independently and protects other dates with the series version", async () => {
    const task = await create("daily");
    const first = await patch(task, { completed: true, date: day }); expect(first.status).toBe(200);
    const updated = (await first.json()).task;
    expect(await list(day)).toMatchObject([{ completed: true, recurrence: "daily", overdue: false }]);
    expect(await list("2026-10-14")).toMatchObject([{ completed: false, completed_at: null, overdue: false }]);
    expect((await patch(task, { completed: true, date: "2026-10-14" })).status).toBe(409);
    const second = await patch(updated, { completed: true, date: "2026-10-14" }); expect(second.status).toBe(200);
    expect(await list(day)).toMatchObject([{ completed: true }]);
    const reopened = await patch((await second.json()).task, { completed: false, date: day }); expect(reopened.status).toBe(200);
    expect(await list(day)).toMatchObject([{ completed: false }]);
    expect(await list("2026-10-14")).toMatchObject([{ completed: true }]);
  });
  it("accepts exactly one concurrent mutation of the same series version", async () => {
    const task = await create("daily");
    const responses = await Promise.all([patch(task, { completed: true, date: day }), patch(task, { completed: true, date: "2026-10-14" })]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await db.query("select * from task_completions where task_id=$1 and completed", [task.id])).rows).toHaveLength(1);
  });
  it("can switch an unfinished once task to daily and complete the selected occurrence atomically", async () => {
    const task = await create();
    const response = await patch(task, { recurrence: "daily", completed: true, date: day });
    expect(response.status).toBe(200);
    expect((await response.json()).task).toMatchObject({ recurrence: "daily", completed: true });
    expect(await list("2026-10-14")).toMatchObject([{ completed: false }]);
  });
  it("stops daily occurrences from the selected date while keeping earlier completions", async () => {
    const task = await create("daily");
    const completed = (await (await patch(task, { completed: true, date: day })).json()).task;
    const response = await DELETE(request("DELETE", undefined, `?updatedAt=${encodeURIComponent(completed.updated_at)}&date=2026-10-14`), itemContext(task.id));
    expect(response.status).toBe(200);
    expect(await list(day)).toMatchObject([{ completed: true, ends_on: day }]);
    expect(await list("2026-10-14")).toEqual([]);
    expect((await db.query("select * from task_completions where task_id=$1", [task.id])).rows).toHaveLength(1);
  });
  it("requires a date for daily changes and disallows rescheduling a daily series", async () => {
    const task = await create("daily");
    expect((await patch(task, { completed: true })).status).toBe(400);
    expect((await patch(task, { completed: true, date: "2026-10-12" })).status).toBe(400);
    expect((await patch(task, { targetDate: "2026-10-14", date: day })).status).toBe(400);
    expect((await patch(task, { recurrence: "once", date: day })).status).toBe(400);
    expect((await DELETE(request("DELETE", undefined, `?updatedAt=${encodeURIComponent(task.updated_at)}`), itemContext(task.id))).status).toBe(400);
    const edited = await patch(task, { title: "每天读书", notes: "共同修改系列", date: day }); expect(edited.status).toBe(200);
    expect(await list("2026-10-15")).toMatchObject([{ title: "每天读书", notes: "共同修改系列" }]);
  });
  it("retains once API compatibility and rejects states outside an occurrence", async () => {
    const task = await create();
    expect((await patch(task, { completed: true, date: "2026-10-12" })).status).toBe(400);
    const response = await patch(task, { completed: true }); expect(response.status).toBe(200);
    const completed = (await response.json()).task;
    expect(completed.completed_on).toBe(day);
    expect((await patch(completed, { completed: false, date: "2026-10-14" })).status).toBe(400);
    expect((await DELETE(request("DELETE", undefined, `?updatedAt=${encodeURIComponent(completed.updated_at)}`), itemContext(task.id))).status).toBe(200);
    expect(await list(day)).toEqual([]);
  });
  it("limits writes to the creator and rejects removal after route authorization", async () => {
    const task = await create("daily");
    auth.current!.member_id = bob;
    expect(await list(day)).toHaveLength(1);
    expect((await patch(task, { completed: true, date: day })).status).toBe(403);
    expect((await DELETE(request("DELETE", undefined, `?updatedAt=${encodeURIComponent(task.updated_at)}&date=${day}`), itemContext(task.id))).status).toBe(403);
    const client = auth.db!;
    const racingClient = { from: client.from.bind(client), rpc: async (...args: Parameters<typeof client.rpc>) => { await db.query("update members set removed_at=now() where id=$1", [bob]); return client.rpc(...args); } } as unknown as DataClient;
    auth.db = racingClient;
    expect((await POST(request("POST", { title: "来不及写入", targetDate: day }), context())).status).toBe(403);
    auth.db = client;
    expect((await db.query("select * from tasks")).rows).toHaveLength(1);
  });
  it("uses the same overdue and daily projections for summary statistics and activity", async () => {
    const once = await create("once", "2026-10-12");
    const daily = await create("daily");
    expect((await patch(daily, { completed: true, date: day })).status).toBe(200);
    const summary = await spaceSummary(space, alice, day);
    expect(summary.tasks).toHaveLength(2);
    expect(summary.tasks.find(item => item.id === once.id)).toMatchObject({ overdue: true });
    expect(summary.stats).toMatchObject({ completedTasks: 0, totalTasks: 0 });
    expect(summary.activity.filter(item => item.text.startsWith("完成了「"))).toHaveLength(1);
    expect(summary.activity.some(item => item.text === "更新了「阅读」")).toBe(true);
  });
  it("counts only group goals and attributes completion to their assignee in mixed summaries", async () => {
    const personalOnce = await create("once", "2026-10-12");
    const personalDaily = await create("daily");
    expect((await patch(personalDaily, { completed: true, date: day })).status).toBe(200);
    const onceResponse = await POST(request("POST", { scope: "group", assigneeId: bob, title: "小组一次目标", targetDate: "2026-10-12", recurrence: "once" }), context());
    expect(onceResponse.status).toBe(201);
    const groupOnce = (await onceResponse.json()).task;
    const dailyResponse = await POST(request("POST", { scope: "group", assigneeId: bob, title: "小组每天目标", targetDate: day, recurrence: "daily" }), context());
    expect(dailyResponse.status).toBe(201);
    const groupDaily = (await dailyResponse.json()).task;
    auth.current!.member_id = bob;
    expect((await patch(groupDaily, { completed: true, date: day })).status).toBe(200);
    const summary = await spaceSummary(space, alice, day);
    expect(summary.tasks).toHaveLength(4);
    expect(summary.tasks.find(item => item.id === personalOnce.id)).toMatchObject({ scope: "personal", overdue: true });
    expect(summary.tasks.find(item => item.id === groupOnce.id)).toMatchObject({ scope: "group", creator_id: alice, assignee_id: bob, overdue: true });
    expect(summary.stats).toMatchObject({ completedTasks: 1, totalTasks: 2, checkedIn: 0 });
    expect(summary.checkins).toEqual([]);
    expect(summary.activity.find(item => item.id === personalDaily.id)).toMatchObject({ memberId: alice, nickname: "Alice", text: "完成了「阅读」" });
    expect(summary.activity.find(item => item.id === groupDaily.id)).toMatchObject({ memberId: bob, nickname: "Bob", text: "完成了「小组每天目标」" });
    expect(summary.activity.find(item => item.id === groupOnce.id)).toMatchObject({ memberId: alice, nickname: "Alice", text: "更新了「小组一次目标」" });
    const tomorrow = await spaceSummary(space, alice, "2026-10-14");
    expect(tomorrow.stats).toMatchObject({ completedTasks: 0, totalTasks: 2 });
    expect(tomorrow.tasks.find(item => item.id === groupDaily.id)).toMatchObject({ completed: false, recurrence: "daily" });
  });
  it("accepts full legacy-length notes and rejects 5001 characters", async () => {
    expect((await create("once", day, "文".repeat(5000))).notes).toHaveLength(5000);
    expect((await POST(request("POST", { title: "太长", notes: "文".repeat(5001), targetDate: day }), context())).status).toBe(400);
  });
});

describe("legacy record migration", () => {
  it("imports nonempty logs once with full notes and matching check-in status, retaining originals", async () => {
    const content = "第一行标题\n" + "旧记录".repeat(700);
    await db.query("insert into daily_logs(space_id,member_id,work_date,slot,content) values($1,$2,$3,'morning',$4),($1,$2,'2026-10-12','afternoon','未完成旧记录'),($1,$2,$3,'afternoon','')", [space, alice, day, content]);
    await db.query("insert into daily_checkins(space_id,member_id,work_date) values($1,$2,$3)", [space, alice, day]);
    const migration = await readFile("supabase/migrations/20261013000500_daily_task_occurrences.sql", "utf8");
    // Reapply only the import statement to verify idempotency with existing data.
    const sql = migration.slice(migration.indexOf("-- BEGIN LEGACY LOG IMPORT"), migration.indexOf("-- END LEGACY LOG IMPORT"));
    await db.exec(sql); await db.exec(sql);
    const imported = await db.query<{ notes: string; title: string; completed_on: Date | null }>("select notes,title,completed_on from tasks order by target_date");
    expect(imported.rows).toHaveLength(2);
    expect(imported.rows[1]).toMatchObject({ notes: content, title: "第一行标题" });
    expect(imported.rows[1].completed_on).not.toBeNull();
    const projected = await list(day);
    expect(projected.find((task: { target_date: string }) => task.target_date === "2026-10-12")).toMatchObject({ completed: false, overdue: true });
    expect(projected.find((task: { target_date: string }) => task.target_date === day)).toMatchObject({ completed: true });
    expect((await db.query("select content from daily_logs where content=$1", [content])).rows).toHaveLength(1);
  });
  it("also preserves full notes for members who already left and restores the active-owner guard", async () => {
    const content = "已离开成员的标题\n" + "保留".repeat(2000);
    await db.query("insert into daily_logs(space_id,member_id,work_date,slot,content) values($1,$2,$3,'morning',$4)", [space, bob, day, content]);
    await db.query("update members set removed_at=now() where id=$1", [bob]);
    const migration = await readFile("supabase/migrations/20261013000500_daily_task_occurrences.sql", "utf8");
    await db.exec(migration.slice(migration.indexOf("-- BEGIN LEGACY LOG IMPORT"), migration.indexOf("-- END LEGACY LOG IMPORT")));
    expect((await db.query<{ notes: string }>("select notes from tasks where creator_id=$1", [bob])).rows[0].notes).toBe(content);
    await expect(db.query("insert into tasks(space_id,creator_id,title,target_date) values($1,$2,'新写入',$3)", [space, bob, day])).rejects.toThrow("no longer an active member");
    expect((await db.query<{ tgenabled: string }>("select tgenabled from pg_trigger where tgname='active_task_owner'")).rows[0].tgenabled).toBe("O");
    await db.query("update members set removed_at=null where id=$1", [bob]);
  });
});
