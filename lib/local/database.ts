import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const state = globalThis as typeof globalThis & { checkinDatabase?: Promise<PGlite> };

export async function createLocalDatabase(directory?: string) {
  if (directory) await mkdir(directory, { recursive: true });
  const db = new PGlite(directory);
  await db.waitReady;
  await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;");
  return db;
}

export async function applyMigrations(db: PGlite) {
  await db.exec("CREATE TABLE IF NOT EXISTS public._app_migrations (name text PRIMARY KEY);");
  // Supabase creates these roles/publication; local PostgreSQL supplies them.
  await db.exec("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;");
  await db.exec("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_publication WHERE pubname='supabase_realtime') THEN CREATE PUBLICATION supabase_realtime; END IF; END $$;");
  const folder = path.join(process.cwd(), "supabase", "migrations");
  for (const name of (await readdir(folder)).filter((n) => n.endsWith(".sql")).sort()) {
    const applied = await db.query("SELECT name FROM public._app_migrations WHERE name=$1", [name]);
    if (applied.rows.length) continue;
    // gen_random_uuid is built into PostgreSQL; pgcrypto is not needed locally.
    const sql = (await readFile(path.join(folder, name), "utf8"))
      .replace(/create extension if not exists pgcrypto;/gi, "");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO public._app_migrations(name) VALUES ($1)", [name]);
    });
  }
}

export function getLocalDatabase(): Promise<PGlite> {
  state.checkinDatabase ??= (async () => {
    const directory = process.env.CHECKIN_DATA_DIR ?? path.join(process.cwd(), ".data", "postgres");
    await mkdir(directory, { recursive: true });
    const db = new PGlite(directory);
    await db.waitReady;
    await applyMigrations(db);
    return db;
  })();
  return state.checkinDatabase;
}

