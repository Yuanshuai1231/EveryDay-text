// @vitest-environment node
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const animals = ["cat", "rabbit", "dog", "fox", "bear", "panda", "koala", "frog", "pig", "penguin", "lion", "raccoon"];
const objects = ["book", "coffee", "camera", "rocket", "lamp", "headphones", "backpack", "compass", "trophy", "plant", "palette", "tent"];
function migrationSql() {
  const filename = path.resolve("supabase/migrations/20261013000400_space_object_icons.sql");
  expect(existsSync(filename), "object icon migration must exist").toBe(true);
  return readFileSync(filename, "utf8");
}

async function oldDatabase() {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(`create table spaces(id integer primary key, avatar_id text, constraint spaces_avatar_id_supported check(avatar_id is null or avatar_id in (${animals.map(id => `'${id}'`).join(",")})));
    create table members(id integer primary key, avatar_id text check(avatar_id is null or avatar_id in (${animals.map(id => `'${id}'`).join(",")})));
    create table app_accounts(id integer primary key, avatar_id text check(avatar_id is null or avatar_id in (${animals.map(id => `'${id}'`).join(",")})));`);
  for (let index = 0; index < animals.length; index++) await db.query("insert into spaces values($1,$2)", [index + 1, animals[index]]);
  await db.exec("insert into spaces values(13,null); insert into members values(1,'cat'); insert into app_accounts values(1,'rabbit');");
  return db;
}

describe("space object icon migration", () => {
  it("maps existing space animals to matching objects while preserving account and member animals", async () => {
    const sql = migrationSql();
    const db = await oldDatabase();
    try {
      await db.exec(sql);
      expect((await db.query<{ avatar_id: string | null }>("select avatar_id from spaces order by id")).rows.map(row => row.avatar_id)).toEqual([...objects, null]);
      expect((await db.query("select avatar_id from members")).rows[0]).toEqual({ avatar_id: "cat" });
      expect((await db.query("select avatar_id from app_accounts")).rows[0]).toEqual({ avatar_id: "rabbit" });
    } finally { await db.close(); }
  }, 30000);

  it("accepts all object identifiers and rejects animals after migration", async () => {
    const sql = migrationSql();
    const db = await oldDatabase();
    try {
      await db.exec(sql);
      for (const object of objects) await db.query("update spaces set avatar_id=$1 where id=1", [object]);
      await expect(db.query("update spaces set avatar_id='cat' where id=1")).rejects.toThrow(/spaces_avatar_id_supported/);
      await expect(db.query("update members set avatar_id='book' where id=1")).rejects.toThrow(/check constraint/);
    } finally { await db.close(); }
  }, 30000);
});
