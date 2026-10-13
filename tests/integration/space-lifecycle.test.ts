// @vitest-environment node
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { applyMigrations } from "@/lib/local/database";
import { makeLocalFetch } from "@/lib/local/fetch";
import { digestToken } from "@/lib/auth/token";
import { getCurrentAccount } from "@/lib/auth/accounts";
import { resolveSession } from "@/lib/auth/session";
import * as spaceRoute from "@/app/api/spaces/[spaceId]/route";

const auth = vi.hoisted(() => ({
  client: null as unknown,
  token: "owner-session",
  cookieSet: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "daily_account_session" && auth.token
        ? { value: auth.token }
        : undefined,
    set: auth.cookieSet,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => auth.client,
}));
let db: PGlite;
let owner: string, peer: string;
let first: { space_id: string; member_id: string }, second: typeof first;
let peerMember: string;
const client = () =>
  createClient("http://local.test", "test", {
    auth: { persistSession: false },
    global: { fetch: makeLocalFetch(async () => db) },
  });
const context = (spaceId = first.space_id) => ({
  params: Promise.resolve({ spaceId }),
});
const request = (method = "DELETE", origin = "http://localhost") =>
  new NextRequest(`http://localhost/api/spaces/${first.space_id}`, {
    method,
    headers: { origin },
  });
async function deleteSpace(req = request(), ctx = context()) {
  const handler = (spaceRoute as Record<string, unknown>).DELETE;
  expect(handler, "space DELETE handler must exist").toBeTypeOf("function");
  return (handler as (r: NextRequest, c: typeof ctx) => Promise<Response>)(
    req,
    ctx,
  );
}
async function leaveSpace() {
  const { POST } = await import("@/app/api/spaces/[spaceId]/leave/route");
  return POST(request("POST"), context());
}
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await applyMigrations(db);
}, 60000);
beforeEach(async () => {
  await db.exec("TRUNCATE spaces CASCADE; TRUNCATE app_accounts CASCADE;");
  const account = async (email: string) =>
    (
      await db.query<{ id: string }>(
        "insert into app_accounts(email,nickname,verified_at) values($1,$1,now()) returning id",
        [email],
      )
    ).rows[0].id;
  owner = await account("owner@example.test");
  peer = await account("peer@example.test");
  const create = async (hash: string) =>
    (
      await db.query<typeof first>(
        "select * from create_account_space($1,$2,$3,'Asia/Shanghai',$4,'book')",
        [owner, "空间" + hash, "owner@example.test", hash.repeat(64)],
      )
    ).rows[0];
  first = await create("a");
  second = await create("b");
  peerMember = (
    await db.query<{ member_id: string }>(
      "select * from join_account_space($1,$2,$3)",
      [peer, "a".repeat(64), "伙伴"],
    )
  ).rows[0].member_id;
  for (const [id, token] of [
    [owner, "owner-session"],
    [peer, "peer-session"],
    [peer, "peer-other-session"],
  ]) {
    await db.query(
      "insert into account_sessions(account_id,token_digest,selected_space_id,expires_at) values($1,$2,$3,'2099-01-01')",
      [id, digestToken(token), first.space_id],
    );
  }
  await db.query(
    "insert into member_sessions(member_id,token_digest,expires_at) values($1,$2,'2099-01-01')",
    [peerMember, digestToken("peer-legacy")],
  );
  auth.client = client();
  auth.token = "owner-session";
  auth.cookieSet.mockClear();
});
afterAll(async () => {
  await db?.close();
});

describe("space lifecycle", () => {
  it("deletes the creator's space and cascading content while retaining accounts and other spaces", async () => {
    const task = (
      await db.query<{ create_owned_task: { id: string } }>(
        "select create_owned_task($1,$2,'每天','', '2026-10-13','daily')",
        [first.space_id, first.member_id],
      )
    ).rows[0].create_owned_task;
    await db.query(
      "insert into task_completions(space_id,task_id,work_date,completed,completed_at) values($1,$2,'2026-10-13',true,now())",
      [first.space_id, task.id],
    );
    await db.query(
      "insert into daily_logs(space_id,member_id,work_date,slot,content) values($1,$2,'2026-10-13','morning','保留在备份')",
      [first.space_id, first.member_id],
    );
    await db.query(
      "insert into messages(conversation_id,sender_id,client_message_id,body) select id,$2,gen_random_uuid(),'消息' from conversations where space_id=$1",
      [first.space_id, first.member_id],
    );
    const response = await deleteSpace();
    expect(response.status).toBe(200);
    for (const table of [
      "spaces",
      "members",
      "tasks",
      "task_completions",
      "daily_logs",
      "conversations",
    ]) {
      const column = table === "spaces" ? "id" : "space_id";
      expect(
        (
          await db.query<{ count: number }>(
            `select count(*)::int as count from ${table} where ${column}=$1`,
            [first.space_id],
          )
        ).rows[0].count,
      ).toBe(0);
    }
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from messages",
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (await db.query("select id from spaces where id=$1", [second.space_id]))
        .rows,
    ).toHaveLength(1);
    expect((await db.query("select id from app_accounts")).rows).toHaveLength(
      2,
    );
    expect(
      (
        await db.query<{
          selected_space_id: string | null;
          revoked_at: string | null;
        }>("select selected_space_id,revoked_at from account_sessions")
      ).rows.every(
        (row) => row.selected_space_id === null && row.revoked_at === null,
      ),
    ).toBe(true);
    expect(await getCurrentAccount(client())).not.toBeNull();
    expect(auth.cookieSet).not.toHaveBeenCalled();
  });
  it("rejects deletion by a member and preserves the space", async () => {
    auth.token = "peer-session";
    expect((await deleteSpace()).status).toBe(403);
    expect(
      (await db.query("select id from spaces where id=$1", [first.space_id]))
        .rows,
    ).toHaveLength(1);
  });
  it("rejects cross-origin, unauthenticated, and invalid identifiers", async () => {
    expect(
      (await deleteSpace(request("DELETE", "https://foreign.test"))).status,
    ).toBe(403);
    auth.token = "";
    expect((await deleteSpace()).status).toBe(401);
    auth.token = "owner-session";
    expect((await deleteSpace(request(), context("bad-id"))).status).toBe(400);
  });
  it("allows a member to leave, preserves history, and clears all their selected-space sessions", async () => {
    auth.token = "peer-session";
    await db.query(
      "insert into daily_logs(space_id,member_id,work_date,slot,content) values($1,$2,'2026-10-13','morning','成员历史')",
      [first.space_id, peerMember],
    );
    expect((await leaveSpace()).status).toBe(200);
    expect(
      (
        await db.query<{ removed_at: string | null }>(
          "select removed_at from members where id=$1",
          [peerMember],
        )
      ).rows[0].removed_at,
    ).not.toBeNull();
    expect(
      (
        await db.query("select id from daily_logs where member_id=$1", [
          peerMember,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query<{ revoked_at: string | null }>(
          "select revoked_at from member_sessions where member_id=$1",
          [peerMember],
        )
      ).rows[0].revoked_at,
    ).not.toBeNull();
    expect(
      (
        await db.query<{
          selected_space_id: string | null;
          revoked_at: string | null;
        }>(
          "select selected_space_id,revoked_at from account_sessions where account_id=$1",
          [peer],
        )
      ).rows.every(
        (row) => row.selected_space_id === null && row.revoked_at === null,
      ),
    ).toBe(true);
    expect(
      (
        await db.query<{ selected_space_id: string | null }>(
          "select selected_space_id from account_sessions where account_id=$1",
          [owner],
        )
      ).rows[0].selected_space_id,
    ).toBe(first.space_id);
    expect(
      await resolveSession("peer-session", client(), first.space_id),
    ).toBeNull();
    expect(await getCurrentAccount(client())).not.toBeNull();
    expect(auth.cookieSet).not.toHaveBeenCalled();
  });
  it("requires the creator to transfer ownership before leaving", async () => {
    expect((await leaveSpace()).status).toBe(409);
    expect(
      (
        await db.query<{ removed_at: string | null }>(
          "select removed_at from members where id=$1",
          [first.member_id],
        )
      ).rows[0].removed_at,
    ).toBeNull();
  });
  it("does not give public database roles deletion permission", async () => {
    const result = await db.query(
      "select has_function_privilege('anon','delete_space(uuid,uuid)','execute') as anon, has_function_privilege('authenticated','delete_space(uuid,uuid)','execute') as authenticated",
    );
    expect(result.rows[0]).toEqual({ anon: false, authenticated: false });
  });
  it("can delete an imported task after its author has left, without permitting direct history writes", async () => {
    const logId = (
      await db.query<{ id: string }>(
        "insert into daily_logs(space_id,member_id,work_date,slot,content) values($1,$2,'2026-10-13','morning','历史') returning id",
        [first.space_id, peerMember],
      )
    ).rows[0].id;
    await db.query(
      "insert into tasks(space_id,creator_id,title,notes,target_date,source_log_id) values($1,$2,'历史',$3,'2026-10-13',$4)",
      [first.space_id, peerMember, "旧".repeat(5001), logId],
    );
    await db.query("select remove_space_member($1,$2,$3)", [
      first.space_id,
      first.member_id,
      peerMember,
    ]);
    await expect(
      db.query("delete from tasks where creator_id=$1", [peerMember]),
    ).rejects.toThrow(/active member/);
    const response = await deleteSpace();
    expect(response.status).toBe(200);
  });
});
