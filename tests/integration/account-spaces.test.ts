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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyMigrations } from "@/lib/local/database";
import { makeLocalFetch } from "@/lib/local/fetch";
import { digestToken } from "@/lib/auth/token";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  client: null as unknown,
  token: undefined as string | undefined,
  cookieSet: vi.fn(),
}));
vi.mock("@/lib/auth/rate-limit", () => ({
  joinRateLimiter: { check: () => ({ allowed: true, retryAfter: 0 }) },
  spaceCreateRateLimiter: { check: () => ({ allowed: true, retryAfter: 0 }) },
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
type Actor = {
  id: string;
  email: string;
  nickname: string;
  verified_at: string | null;
};
const primaryToken = "account-spaces-primary-session";
const otherToken = "account-spaces-other-session";

function client(): SupabaseClient {
  return createClient("http://account-spaces.invalid", "service-role-test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: makeLocalFetch(async () => db) },
  });
}

async function createAccount(
  email: string,
  nickname: string,
  token: string,
  verified = true,
): Promise<Actor> {
  const result = await db.query<Actor>(
    "insert into app_accounts(email,nickname,verified_at) values($1,$2,$3) returning id,email,nickname,verified_at",
    [email, nickname, verified ? "2026-10-13T00:00:00Z" : null],
  );
  await db.query(
    "insert into account_sessions(account_id,token_digest,expires_at) values($1,$2,$3)",
    [result.rows[0].id, digestToken(token), "2099-01-01"],
  );
  return result.rows[0];
}

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await applyMigrations(db);
}, 60000);
beforeEach(async () => {
  await db.exec("TRUNCATE app_accounts CASCADE;");
  await createAccount("primary@example.test", "主账号", primaryToken);
  await createAccount("other@example.test", "其他账号", otherToken);
  auth.client = client();
  auth.token = primaryToken;
  auth.cookieSet.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(async () => {
  await db?.close();
});

function request(path: string, body?: unknown, method = "POST") {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      origin: "http://localhost",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as never;
}

async function accountId(email: string) {
  return (
    await db.query<{ id: string }>(
      "select id from app_accounts where email=$1",
      [email],
    )
  ).rows[0].id;
}

describe("verified account spaces", () => {
  it("blocks unauthenticated reads, creates, and joins", async () => {
    auth.token = undefined;
    const { GET, POST: create } = await import("@/app/api/spaces/route");
    const { POST: join } = await import("@/app/api/spaces/join/route");
    expect((await GET()).status).toBe(401);
    expect(
      (await create(request("/api/spaces", { name: "未登录" }))).status,
    ).toBe(401);
    expect(
      (await join(request("/api/spaces/join", { inviteCode: "AB12CD34" })))
        .status,
    ).toBe(401);
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from spaces",
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it("requires a verified account for the database creation RPC", async () => {
    const pending = await createAccount(
      "pending@example.test",
      "待验证",
      "pending-session",
      false,
    );
    await expect(
      db.query("select * from create_account_space($1,$2,$3,$4,$5,$6)", [
        pending.id,
        "不可创建",
        pending.nickname,
        "Asia/Shanghai",
        "f".repeat(64),
        "book",
      ]),
    ).rejects.toThrow(/verified account/i);
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from spaces",
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it("limits privileged account membership transactions to the service role", async () => {
    const privileges = await db.query<{
      create_allowed: boolean;
      join_allowed: boolean;
      update_allowed: boolean;
    }>(
      "select has_function_privilege('anon','create_account_space(uuid,text,text,text,text,text)','execute') as create_allowed, has_function_privilege('authenticated','join_account_space(uuid,text,text)','execute') as join_allowed, has_function_privilege('anon','update_account_space(uuid,uuid,text,text)','execute') as update_allowed",
    );
    expect(privileges.rows[0]).toEqual({
      create_allowed: false,
      join_allowed: false,
      update_allowed: false,
    });
  });

  it("creates spaces under the account without issuing a legacy member cookie", async () => {
    const { POST } = await import("@/app/api/spaces/route");
    const response = await POST(
      request("/api/spaces", {
        name: "我的小组",
        avatarId: "rocket",
        timezone: "Asia/Hong_Kong",
      }),
    );
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toMatchObject({
      inviteCode: expect.stringMatching(/^[A-Z0-9]{8}$/),
    });
    expect(auth.cookieSet).not.toHaveBeenCalled();
    expect(
      (
        await db.query("select account_id,role from members where id=$1", [
          payload.memberId,
        ])
      ).rows[0],
    ).toEqual({
      account_id: await accountId("primary@example.test"),
      role: "creator",
    });
    expect(
      (
        await db.query(
          "select name,avatar_id,timezone,theme_id from spaces where id=$1",
          [payload.spaceId],
        )
      ).rows[0],
    ).toEqual({
      name: "我的小组",
      avatar_id: "rocket",
      timezone: "Asia/Hong_Kong",
      theme_id: "growth-purple",
    });
  });

  it("lists only the signed-in account's active memberships and never returns invite digests", async () => {
    const { POST } = await import("@/app/api/spaces/route");
    await POST(request("/api/spaces", { name: "属于主账号" }));
    await POST(request("/api/spaces", { name: "主账号第二组" }));
    auth.token = otherToken;
    await POST(request("/api/spaces", { name: "属于其他账号" }));
    auth.token = primaryToken;
    const { GET } = await import("@/app/api/spaces/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.spaces).toHaveLength(2);
    expect(payload.spaces[0]).toMatchObject({
      name: "属于主账号",
      role: "creator",
      memberCount: 1,
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /invite_hash|token_digest|other@example\.test/,
    );
    await db.query("update members set removed_at=now() where id=$1", [
      payload.spaces[0].memberId,
    ]);
    expect((await (await GET()).json()).spaces).toHaveLength(1);
  });

  it("joins with the account nickname and returns the same identity on repeated join", async () => {
    const { POST: create } = await import("@/app/api/spaces/route");
    const created = await (
      await create(request("/api/spaces", { name: "同一小组" }))
    ).json();
    const { POST: join } = await import("@/app/api/spaces/join/route");
    auth.token = otherToken;
    const first = await join(
      request("/api/spaces/join", { inviteCode: created.inviteCode }),
    );
    expect(first.status).toBe(201);
    const memberId = (await first.json()).memberId;
    const repeated = await join(
      request("/api/spaces/join", {
        inviteCode: created.inviteCode,
        nickname: "忽略昵称",
      }),
    );
    expect(repeated.status).toBe(200);
    expect(await repeated.json()).toMatchObject({ memberId, joined: false });
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from members where space_id=$1",
          [created.spaceId],
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it("preserves membership history and role when a removed account rejoins", async () => {
    const { POST: create } = await import("@/app/api/spaces/route");
    const created = await (
      await create(request("/api/spaces", { name: "重新加入" }))
    ).json();
    const { POST: join } = await import("@/app/api/spaces/join/route");
    auth.token = otherToken;
    const first = await (
      await join(
        request("/api/spaces/join", { inviteCode: created.inviteCode }),
      )
    ).json();
    const original = (
      await db.query<{ id: string; role: string; joined_at: Date }>(
        "select id,role,joined_at from members where id=$1",
        [first.memberId],
      )
    ).rows[0];
    await db.query(
      "insert into daily_checkins(space_id,member_id,work_date) values($1,$2,'2026-10-13')",
      [created.spaceId, first.memberId],
    );
    await db.query("select remove_space_member($1,$2,$3)", [
      created.spaceId,
      (
        await db.query<{ id: string }>(
          "select creator_member_id as id from spaces where id=$1",
          [created.spaceId],
        )
      ).rows[0].id,
      first.memberId,
    ]);
    const joined = await join(
      request("/api/spaces/join", { inviteCode: created.inviteCode }),
    );
    expect(joined.status).toBe(201);
    expect(await joined.json()).toMatchObject({
      memberId: first.memberId,
      joined: true,
    });
    const restored = (
      await db.query(
        "select id,role,joined_at,removed_at from members where id=$1",
        [first.memberId],
      )
    ).rows[0];
    expect(restored).toMatchObject({
      ...original,
      role: "member",
      removed_at: null,
    });
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from daily_checkins where member_id=$1",
          [first.memberId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it("restores only group conversation membership when a removed account rejoins", async () => {
    const { POST: create } = await import("@/app/api/spaces/route");
    const created = await (
      await create(request("/api/spaces", { name: "只恢复群聊" }))
    ).json();
    const { POST: join } = await import("@/app/api/spaces/join/route");
    auth.token = otherToken;
    const peer = await (
      await join(
        request("/api/spaces/join", { inviteCode: created.inviteCode }),
      )
    ).json();
    const direct = (
      await db.query<{ id: string }>(
        "select id from open_direct_conversation($1,$2,$3)",
        [created.spaceId, created.memberId, peer.memberId],
      )
    ).rows[0];
    await db.query("select remove_space_member($1,$2,$3)", [
      created.spaceId,
      created.memberId,
      peer.memberId,
    ]);
    expect(
      (
        await join(
          request("/api/spaces/join", { inviteCode: created.inviteCode }),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await db.query<{ conversation_id: string }>(
          "select conversation_id from conversation_members where member_id=$1",
          [peer.memberId],
        )
      ).rows,
    ).not.toContainEqual({ conversation_id: direct.id });
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from conversation_members cm join conversations c on c.id=cm.conversation_id where cm.member_id=$1 and c.kind='group'",
          [peer.memberId],
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it("keeps a duplicate nickname distinct from an invalid invitation", async () => {
    const { POST: create } = await import("@/app/api/spaces/route");
    const created = await (
      await create(request("/api/spaces", { name: "昵称检查" }))
    ).json();
    const { POST: join } = await import("@/app/api/spaces/join/route");
    auth.token = otherToken;
    const collision = await join(
      request("/api/spaces/join", {
        inviteCode: created.inviteCode,
        nickname: "主账号",
      }),
    );
    expect(collision.status).toBe(409);
    expect((await collision.json()).error.code).toBe("CONFLICT");
    const invalid = await join(
      request("/api/spaces/join", { inviteCode: "AB12CD34" }),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_INVITE");
  });

  it("uses the current creator after a role transfer and blocks a stale creator write", async () => {
    const { POST: create } = await import("@/app/api/spaces/route");
    const created = await (
      await create(request("/api/spaces", { name: "角色转移" }))
    ).json();
    const { POST: join } = await import("@/app/api/spaces/join/route");
    auth.token = otherToken;
    const successor = await (
      await join(
        request("/api/spaces/join", { inviteCode: created.inviteCode }),
      )
    ).json();
    await db.query("select transfer_space_owner($1,$2,$3)", [
      created.spaceId,
      created.memberId,
      successor.memberId,
    ]);
    const { PATCH } = await import("@/app/api/spaces/[spaceId]/route");
    const context = { params: Promise.resolve({ spaceId: created.spaceId }) };
    auth.token = primaryToken;
    expect(
      (
        await PATCH(
          request(
            `/api/spaces/${created.spaceId}`,
            { name: "已转交" },
            "PATCH",
          ),
          context,
        )
      ).status,
    ).toBe(403);
    auth.token = otherToken;
    expect(
      (
        await PATCH(
          request(
            `/api/spaces/${created.spaceId}`,
            { name: "继任创建者", avatarId: "book" },
            "PATCH",
          ),
          context,
        )
      ).status,
    ).toBe(200);
  });

  it("rejects an invalid group avatar and invalid timezone without adding a space", async () => {
    const { POST: create } = await import("@/app/api/spaces/route");
    expect(
      (
        await create(
          request("/api/spaces", { name: "头像不合法", avatarId: "unicorn" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await create(
          request("/api/spaces", {
            name: "时区不合法",
            timezone: "invalid/timezone",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from spaces",
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it("emits an account-authenticated stream update when only group settings change", async () => {
    const { POST: create } = await import("@/app/api/spaces/route");
    const created = await (
      await create(request("/api/spaces", { name: "实时名称" }))
    ).json();
    const { GET } = await import("@/app/api/spaces/[spaceId]/events/route");
    const abort = new AbortController();
    const response = await GET(
      new NextRequest("http://localhost/events", {
        headers: { cookie: `daily_account_session=${primaryToken}` },
        signal: abort.signal,
      }),
      { params: Promise.resolve({ spaceId: created.spaceId }) },
    );
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const next = async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          reader.read().then(({ value }) => new TextDecoder().decode(value)),
          new Promise<string>((resolve) => {
            timer = setTimeout(() => resolve("timeout"), 4500);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    try {
      expect(await next()).toContain("event: update");
      await db.query(
        "update spaces set name='实时新名称',avatar_id='rocket' where id=$1",
        [created.spaceId],
      );
      expect(await next()).toContain("event: update");
    } finally {
      abort.abort();
      await reader.cancel();
    }
  }, 10000);

  it("lets only the creator update a valid group name, avatar, and shared theme", async () => {
    const { POST: create } = await import("@/app/api/spaces/route");
    const created = await (
      await create(request("/api/spaces", { name: "只允许创建者" }))
    ).json();
    const { PATCH } = await import("@/app/api/spaces/[spaceId]/route");
    const context = { params: Promise.resolve({ spaceId: created.spaceId }) };
    expect(
      (
        await PATCH(
          request(
            `/api/spaces/${created.spaceId}`,
            { name: "更新成功", avatarId: "headphones", themeId: "mint-blue" },
            "PATCH",
          ),
          context,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await db.query("select name,avatar_id,theme_id from spaces where id=$1", [
          created.spaceId,
        ])
      ).rows[0],
    ).toEqual({ name: "更新成功", avatar_id: "headphones", theme_id: "mint-blue" });
    const invalidTheme = await PATCH(
      request(`/api/spaces/${created.spaceId}`, { name: "主题无效", themeId: "neon" }, "PATCH"),
      context,
    );
    expect(invalidTheme.status).toBe(400);
    expect(
      (
        await PATCH(
          request(
            `/api/spaces/${created.spaceId}`,
            { name: "只修改名称" },
            "PATCH",
          ),
          context,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await db.query("select name,avatar_id,theme_id from spaces where id=$1", [
          created.spaceId,
        ])
      ).rows[0],
    ).toEqual({ name: "只修改名称", avatar_id: "headphones", theme_id: "mint-blue" });
    auth.token = otherToken;
    const forbidden = await PATCH(
      request(`/api/spaces/${created.spaceId}`, { name: "越权" }, "PATCH"),
      context,
    );
    expect(forbidden.status).toBe(403);
    expect(
      (
        await db.query<{ name: string }>(
          "select name from spaces where id=$1",
          [created.spaceId],
        )
      ).rows[0].name,
    ).toBe("只修改名称");
    auth.token = primaryToken;
    expect(
      (
        await PATCH(
          request(
            `/api/spaces/${created.spaceId}`,
            { name: "无效头像", avatarId: "unicorn" },
            "PATCH",
          ),
          context,
        )
      ).status,
    ).toBe(400);
  });

  it("selects a space only after validating active account membership", async () => {
    const { POST: create } = await import("@/app/api/spaces/route");
    const created = await (
      await create(request("/api/spaces", { name: "可切换" }))
    ).json();
    const { POST: select } =
      await import("@/app/api/spaces/[spaceId]/select/route");
    const context = { params: Promise.resolve({ spaceId: created.spaceId }) };
    expect(
      (await select(request(`/api/spaces/${created.spaceId}/select`), context))
        .status,
    ).toBe(200);
    expect(
      (
        await db.query<{ selected_space_id: string }>(
          "select selected_space_id from account_sessions where token_digest=$1",
          [digestToken(primaryToken)],
        )
      ).rows[0].selected_space_id,
    ).toBe(created.spaceId);
    auth.token = otherToken;
    expect(
      (await select(request(`/api/spaces/${created.spaceId}/select`), context))
        .status,
    ).toBe(403);
    expect(
      (
        await db.query<{ selected_space_id: string | null }>(
          "select selected_space_id from account_sessions where token_digest=$1",
          [digestToken(otherToken)],
        )
      ).rows[0].selected_space_id,
    ).toBeNull();
  });
});
