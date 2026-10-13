// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { makeLocalFetch } from "@/lib/local/fetch";
import { listTasks } from "@/lib/data/tasks";
import type { DataClient } from "@/lib/data/api";

const folder = "supabase/migrations/";
async function apply(db: PGlite, name: string) {
  await db.exec(
    (await readFile(folder + name, "utf8")).replace(
      /create extension if not exists pgcrypto;/gi,
      "",
    ),
  );
}
async function legacyDatabase() {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE PUBLICATION supabase_realtime;",
  );
  for (const name of (await readdir(folder))
    .filter((name) => name.endsWith(".sql") && name < "20261013000500")
    .sort())
    await apply(db, name);
  const created = (
    await db.query<{ space_id: string; member_id: string }>(
      "select * from create_space_with_member('历史小组','历史成员','Asia/Hong_Kong',$1,$2,'2099-01-01')",
      ["d".repeat(64), "e".repeat(64)],
    )
  ).rows[0];
  const task = (
    await db.query<{ id: string }>(
      "insert into tasks(space_id,creator_id,title,target_date,completed,completed_at,created_at) values($1,$2,'旧已完成',null,true,'2026-10-09T20:00:00Z','2026-10-08T00:00:00Z') returning id",
      [created.space_id, created.member_id],
    )
  ).rows[0].id;
  return { db, created, task };
}
async function assertHistory(db: PGlite, space: string, id: string) {
  const client = createClient("http://local.test", "test", {
    auth: { persistSession: false },
    global: { fetch: makeLocalFetch(async () => db) },
  }) as DataClient;
  expect(await listTasks(client, space, "2026-10-09")).toMatchObject([
    { id, completed: false },
  ]);
  expect(await listTasks(client, space, "2026-10-10")).toMatchObject([
    {
      id,
      target_date: "2026-10-08",
      completed_on: "2026-10-10",
      completed: true,
    },
  ]);
  expect(await listTasks(client, space, "2026-10-13")).toEqual([]);
}
describe("completed legacy tasks without planned dates", () => {
  it("preserves the completion day when importing an old task, including departed authors", async () => {
    const { db, created, task } = await legacyDatabase();
    try {
      await db.query("update members set removed_at=now() where id=$1", [
        created.member_id,
      ]);
      await apply(db, "20261013000500_daily_task_occurrences.sql");
      await assertHistory(db, created.space_id, task);
      expect(
        (
          await db.query<{ tgenabled: string }>(
            "select tgenabled from pg_trigger where tgname='active_task_owner'",
          )
        ).rows[0].tgenabled,
      ).toBe("O");
    } finally {
      await db.close();
    }
  }, 30000);
  it("repairs completion dates when the older reminder migration has already been applied", async () => {
    const { db, created, task } = await legacyDatabase();
    try {
      await apply(db, "20261013000500_daily_task_occurrences.sql");
      await db.exec("alter table tasks disable trigger active_task_owner;");
      await db.query("update tasks set completed_on=null where id=$1", [task]);
      await db.exec("alter table tasks enable trigger active_task_owner;");
      const repair = "20261013000700_legacy_task_completion_dates.sql";
      expect(
        existsSync(folder + repair),
        "incremental completion repair must exist",
      ).toBe(true);
      await apply(db, repair);
      await apply(db, repair);
      await assertHistory(db, created.space_id, task);
    } finally {
      await db.close();
    }
  }, 30000);
});
