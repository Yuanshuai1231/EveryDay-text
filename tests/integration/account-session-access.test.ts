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
import type { DataClient } from "@/lib/data/api";
import {
  GET as logs,
  PUT as saveLog,
} from "@/app/api/spaces/[spaceId]/logs/route";
import { GET as summary } from "@/app/api/spaces/[spaceId]/summary/route";
import { GET as messages } from "@/app/api/conversations/[conversationId]/messages/route";
import { DELETE as remove } from "@/app/api/spaces/[spaceId]/members/[memberId]/route";

const state = vi.hoisted(() => ({
  client: null as DataClient | null,
  account: "account-session",
  legacy: undefined as string | undefined,
  cookieSet: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value =
        name === "daily_account_session" ? state.account : state.legacy;
      return value ? { value } : undefined;
    },
    set: state.cookieSet,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => state.client,
}));
let database: PGlite;
let first: { space_id: string; member_id: string },
  second: { space_id: string; member_id: string },
  outsider: { space_id: string; member_id: string };
let accountId: string;
function context(spaceId: string) {
  return { params: Promise.resolve({ spaceId }) };
}
function request(path: string, method = "GET", body?: unknown) {
  return new NextRequest(`https://checkin.example${path}`, {
    method,
    headers: {
      origin: "https://checkin.example",
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function createAccount(email: string) {
  return (
    await database.query<{ id: string }>(
      "insert into app_accounts(email,nickname,verified_at) values($1,$1,now()) returning id",
      [email],
    )
  ).rows[0].id;
}
beforeAll(async () => {
  database = new PGlite();
  await database.waitReady;
  await applyMigrations(database);
  state.client = createClient("http://local.test", "test", {
    auth: { persistSession: false },
    global: { fetch: makeLocalFetch(async () => database) },
  }) as DataClient;
  accountId = await createAccount("owner@example.com");
  const create = async (id: string, hash: string) => {
    const nickname = (
      await database.query<{ nickname: string }>(
        "select nickname from app_accounts where id=$1",
        [id],
      )
    ).rows[0].nickname;
    return (
      await database.query<{ space_id: string; member_id: string }>(
        "select * from create_account_space($1,$2,$3,$4,$5,$6)",
        [id, "小组" + hash, nickname, "Asia/Shanghai", hash.repeat(64), "book"],
      )
    ).rows[0];
  };
  first = await create(accountId, "a");
  second = await create(accountId, "b");
  outsider = await create(await createAccount("other@example.com"), "c");
  await database.query(
    "insert into account_sessions(account_id,token_digest,selected_space_id,expires_at) values($1,$2,$3,'2099-01-01')",
    [accountId, digestToken(state.account), first.space_id],
  );
}, 60000);
beforeEach(() => {
  state.account = "account-session";
  state.legacy = undefined;
  state.cookieSet.mockClear();
});
afterAll(async () => {
  await database?.close();
});

describe("account identity resolves each requested space", () => {
  it("reads and writes a second membership without changing the selected space", async () => {
    const saved = await saveLog(
      request(`/api/spaces/${second.space_id}/logs`, "PUT", {
        date: "2026-10-13",
        slot: "morning",
        content: "第二组的记录",
        editedAt: null,
      }),
      context(second.space_id),
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).log.member_id).toBe(second.member_id);
    expect(
      (
        await logs(
          request(`/api/spaces/${second.space_id}/logs?date=2026-10-13`),
          context(second.space_id),
        )
      ).status,
    ).toBe(200);
    const result = await summary(
      request(`/api/spaces/${second.space_id}/summary`),
      context(second.space_id),
    );
    expect(result.status).toBe(200);
    expect((await result.json()).member.id).toBe(second.member_id);
  });
  it("uses the conversation's own space to authorize chat", async () => {
    const group = (
      await database.query<{ id: string }>(
        "select id from conversations where space_id=$1 and kind='group'",
        [second.space_id],
      )
    ).rows[0].id;
    expect(
      (
        await messages(request(`/api/conversations/${group}/messages`), {
          params: Promise.resolve({ conversationId: group }),
        })
      ).status,
    ).toBe(200);
  });
  it("rejects another account's space and conversation", async () => {
    expect([401, 403]).toContain(
      (
        await summary(
          request(`/api/spaces/${outsider.space_id}/summary`),
          context(outsider.space_id),
        )
      ).status,
    );
    const group = (
      await database.query<{ id: string }>(
        "select id from conversations where space_id=$1",
        [outsider.space_id],
      )
    ).rows[0].id;
    expect([401, 403]).toContain(
      (
        await messages(request(`/api/conversations/${group}/messages`), {
          params: Promise.resolve({ conversationId: group }),
        })
      ).status,
    );
  });
  it("does not recover a revoked account with a legacy cookie", async () => {
    state.account = "invalid-account";
    state.legacy = "unknown-legacy";
    expect(
      (
        await logs(
          request(`/api/spaces/${first.space_id}/logs?date=2026-10-13`),
          context(first.space_id),
        )
      ).status,
    ).toBe(401);
  });
  it("leaves one membership without deleting the account session cookie", async () => {
    await database.query(
      "update spaces set creator_member_id=null where id=$1",
      [second.space_id],
    );
    const result = await remove(
      request(
        `/api/spaces/${second.space_id}/members/${second.member_id}`,
        "DELETE",
      ),
      {
        params: Promise.resolve({
          spaceId: second.space_id,
          memberId: second.member_id,
        }),
      },
    );
    expect(result.status).toBe(200);
    expect(state.cookieSet).not.toHaveBeenCalled();
    expect(
      (
        await summary(
          request(`/api/spaces/${first.space_id}/summary`),
          context(first.space_id),
        )
      ).status,
    ).toBe(200);
  });
});
