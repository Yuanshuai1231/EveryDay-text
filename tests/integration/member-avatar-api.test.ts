// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { applyMigrations } from "@/lib/local/database";
import { makeLocalFetch } from "@/lib/local/fetch";
import { digestToken } from "@/lib/auth/token";
import type { Database } from "@/lib/supabase/types";

const boundary = vi.hoisted(() => ({
  client: null as unknown,
  token: undefined as string | undefined,
  cookieSet: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => name === "daily_member_session" && boundary.token ? { value: boundary.token } : undefined,
  set: boundary.cookieSet,
}) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => boundary.client }));

type Actor = { space_id: string; member_id: string; session_id: string };
type RouteContext = { params: Promise<{ spaceId: string; memberId: string }> };
type PatchRoute = (request: NextRequest, context: RouteContext) => Promise<Response>;
const creatorToken = "avatar-test-creator-token";
const peerToken = "avatar-test-peer-token";
const otherToken = "avatar-test-other-space-token";
const avatars = ["cat", "rabbit", "dog", "fox", "bear", "panda", "koala", "frog", "pig", "penguin", "lion", "raccoon"];
let db: PGlite;
let directory: string;
let creator: Actor, peer: Actor, other: Actor;

function client(transport: typeof fetch = makeLocalFetch(async () => db)): SupabaseClient<Database> {
  return createClient<Database>("http://avatar-database.invalid", "test-server-only", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: transport },
  });
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "checkin-member-avatars-"));
  db = new PGlite(directory);
  await db.waitReady;
  await applyMigrations(db);
}, 60000);

beforeEach(async () => {
  await db.exec("TRUNCATE public.spaces, public.members, public.member_sessions, public.conversations, public.conversation_members, public.messages, public.tasks, public.daily_logs, public.daily_checkins CASCADE;");
  creator = (await db.query<Actor>("select * from create_space_with_member($1,$2,$3,$4,$5,$6)", ["头像小组", "小猫", "Asia/Shanghai", "a".repeat(64), digestToken(creatorToken), "2099-01-01"])).rows[0];
  peer = (await db.query<Actor>("select * from join_space_by_invite($1,$2,$3,$4)", ["a".repeat(64), "小兔", digestToken(peerToken), "2099-01-01"])).rows[0];
  other = (await db.query<Actor>("select * from create_space_with_member($1,$2,$3,$4,$5,$6)", ["另一个小组", "小狗", "Asia/Shanghai", "b".repeat(64), digestToken(otherToken), "2099-01-01"])).rows[0];
  boundary.client = client();
  boundary.token = creatorToken;
  boundary.cookieSet.mockClear();
});

afterAll(async () => {
  await db?.close();
  if (directory && path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) && path.basename(directory).startsWith("checkin-member-avatars-")) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function getPatch(): Promise<PatchRoute> {
  const route = await import("@/app/api/spaces/[spaceId]/members/[memberId]/route");
  expect(route, "the member route must expose avatar PATCH").toHaveProperty("PATCH", expect.any(Function));
  return (route as unknown as { PATCH: PatchRoute }).PATCH;
}

function request(body: unknown, origin = "http://localhost", fetchSite?: string) {
  return new NextRequest("http://localhost/api/spaces/members", {
    method: "PATCH",
    headers: { origin, "content-type": "application/json", ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}) },
    body: JSON.stringify(body),
  });
}

function context(memberId = creator.member_id, spaceId = creator.space_id): RouteContext {
  return { params: Promise.resolve({ spaceId, memberId }) };
}

async function patch(avatarId: unknown, memberId = creator.member_id, spaceId = creator.space_id) {
  return (await getPatch())(request({ avatarId }), context(memberId, spaceId));
}

async function avatar(memberId: string) {
  return (await db.query<{ avatar_id: string | null }>("select avatar_id from members where id=$1", [memberId])).rows[0].avatar_id;
}

describe("avatar database migration", () => {
  it("adds a nullable column without changing existing member defaults", async () => {
    const columns = await db.query<{ column_name: string; is_nullable: string }>("select column_name,is_nullable from information_schema.columns where table_schema='public' and table_name='members'");
    expect(columns.rows).toContainEqual({ column_name: "avatar_id", is_nullable: "YES" });
    expect(await avatar(creator.member_id)).toBeNull();
    expect(await avatar(peer.member_id)).toBeNull();
  });

  it("allows every catalog identifier and null, rejects unknown identifiers, and can be rerun safely", async () => {
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema='public' and table_name='members'");
    expect(columns.rows.map((row) => row.column_name)).toContain("avatar_id");
    const migration = await readFile(path.resolve("supabase/migrations/0005_member_avatars.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    for (const id of [...avatars, null]) {
      await db.query("update members set avatar_id=$1 where id=$2", [id, creator.member_id]);
      expect(await avatar(creator.member_id)).toBe(id);
    }
    await expect(db.query("update members set avatar_id='unicorn' where id=$1", [creator.member_id])).rejects.toMatchObject({ code: "23514" });
    expect(await avatar(creator.member_id)).toBeNull();
  });
});

describe("member avatar PATCH with actual sessions and PostgreSQL", () => {
  it("saves only the current member's avatar and returns the shared member fields without replacing the cookie", async () => {
    const response = await patch("fox");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ member: {
      id: creator.member_id, nickname: "小猫", role: "creator", avatar_color: "#F9C95E", avatar_id: "fox",
    } });
    expect(await avatar(creator.member_id)).toBe("fox");
    expect(await avatar(peer.member_id)).toBeNull();
    expect(boundary.cookieSet).not.toHaveBeenCalled();
    expect(response.headers.has("set-cookie")).toBe(false);
    expect((await db.query<{ token_digest: string }>("select token_digest from member_sessions where id=$1", [creator.session_id])).rows[0].token_digest).toBe(digestToken(creatorToken));
  });

  it("retains the saved avatar after reopening the database and uses it in later requests", async () => {
    expect((await patch("panda")).status).toBe(200);
    await db.close();
    db = new PGlite(directory);
    await db.waitReady;
    boundary.client = client();
    expect(await avatar(creator.member_id)).toBe("panda");
    const { spaceSummary } = await import("@/lib/data/space-summary");
    expect((await spaceSummary(creator.space_id, creator.member_id, "2026-10-13")).member).toMatchObject({ avatar_id: "panda" });
  }, 15000);

  it("lets regular members change their own avatar", async () => {
    boundary.token = peerToken;
    expect((await patch("rabbit", peer.member_id)).status).toBe(200);
    expect(await avatar(peer.member_id)).toBe("rabbit");
  });

  it("forbids creators from changing another member's avatar", async () => {
    expect((await patch("lion", peer.member_id)).status).toBe(403);
    expect(await avatar(peer.member_id)).toBeNull();
  });

  it("forbids regular members from changing another member's avatar", async () => {
    boundary.token = peerToken;
    expect((await patch("lion", creator.member_id)).status).toBe(403);
    expect(await avatar(creator.member_id)).toBeNull();
  });

  it("rejects a target member from a different space", async () => {
    expect((await patch("dog", other.member_id)).status).toBe(403);
    expect(await avatar(other.member_id)).toBeNull();
  });

  it("rejects a request naming a different space", async () => {
    expect((await patch("dog", creator.member_id, other.space_id)).status).toBe(403);
    expect(await avatar(creator.member_id)).toBeNull();
  });

  it.each([undefined, "unknown-session-token"])("rejects missing or unknown session cookies: %s", async (token) => {
    boundary.token = token;
    expect((await patch("cat")).status).toBe(401);
  });

  it.each(["expired", "revoked", "removed"])("rejects an inactive session: %s", async (state) => {
    const PATCH = await getPatch();
    if (state === "expired") await db.query("update member_sessions set expires_at='2000-01-01' where id=$1", [creator.session_id]);
    if (state === "revoked") await db.query("update member_sessions set revoked_at=now() where id=$1", [creator.session_id]);
    if (state === "removed") await db.query("update members set removed_at=now() where id=$1", [creator.member_id]);
    expect((await PATCH(request({ avatarId: "cat" }), context())).status).toBe(401);
    expect(await avatar(creator.member_id)).toBeNull();
  });

  it("refuses the conditional write if the member is removed after authorization", async () => {
    boundary.token = peerToken;
    const transport = makeLocalFetch(async () => db);
    boundary.client = client(async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (init?.method === "PATCH" && url.pathname === "/rest/v1/members") {
        await db.query("select remove_space_member($1,$2,$3)", [creator.space_id, creator.member_id, peer.member_id]);
      }
      return transport(input, init);
    });
    expect((await patch("rabbit", peer.member_id)).status).toBe(403);
    expect(await avatar(peer.member_id)).toBeNull();
  });

  it.each([null, [], {}, { avatarId: null }, { avatarId: "" }, { avatarId: "unicorn" }, { avatarId: "Cat" }, { avatarId: 1 }].map((body) => [body]))("rejects invalid avatar bodies: %j", async (body) => {
    expect((await (await getPatch())(request(body), context())).status).toBe(400);
    expect(await avatar(creator.member_id)).toBeNull();
  });

  it("rejects malformed JSON", async () => {
    const PATCH = await getPatch();
    const malformed = new NextRequest("http://localhost/api/spaces/members", { method: "PATCH", headers: { origin: "http://localhost", "content-type": "application/json" }, body: "{" });
    expect((await PATCH(malformed, context())).status).toBe(400);
  });

  it("ignores attempts to mutate nickname, role or avatar color through an avatar update", async () => {
    const response = await (await getPatch())(request({ avatarId: "cat", nickname: "伪造", role: "member", avatar_color: "#000000" }), context());
    expect(response.status).toBe(200);
    expect((await response.json()).member).toMatchObject({ nickname: "小猫", role: "creator", avatar_color: "#F9C95E", avatar_id: "cat" });
  });

  it.each([["https://hostile.example", undefined], ["http://localhost", "cross-site"]])("rejects cross-site writes: %s %s", async (origin, fetchSite) => {
    expect((await (await getPatch())(request({ avatarId: "cat" }, origin, fetchSite), context())).status).toBe(403);
    expect(await avatar(creator.member_id)).toBeNull();
  });
});

describe("shared avatar read and live update paths", () => {
  it("exposes a saved avatar to another active member through summary and logs reads", async () => {
    expect((await patch("koala")).status).toBe(200);
    boundary.token = peerToken;
    const { spaceSummary } = await import("@/lib/data/space-summary");
    const summary = await spaceSummary(creator.space_id, peer.member_id, "2026-10-13");
    expect(summary.members.find((member) => member.id === creator.member_id)).toMatchObject({ avatar_id: "koala" });
    const { GET } = await import("@/app/api/spaces/[spaceId]/logs/route");
    const response = await GET(new NextRequest("http://localhost/?date=2026-10-13"), { params: Promise.resolve({ spaceId: creator.space_id }) });
    expect(response.status).toBe(200);
    expect((await response.json()).members.find((member: { id: string }) => member.id === creator.member_id)).toMatchObject({ avatar_id: "koala" });
  });

  it("emits a new stream update when only a member's avatar changes", async () => {
    const PATCH = await getPatch();
    const { GET } = await import("@/app/api/spaces/[spaceId]/events/route");
    const abort = new AbortController();
    const response = await GET(new NextRequest("http://localhost/api/spaces/events", { headers: { cookie: `daily_member_session=${creatorToken}` }, signal: abort.signal }), { params: Promise.resolve({ spaceId: creator.space_id }) });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const nextEvent = async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          reader.read().then(({ value }) => new TextDecoder().decode(value)),
          new Promise<string>((resolve) => { timeout = setTimeout(() => resolve("timeout"), 4500); }),
        ]);
      } finally { if (timeout) clearTimeout(timeout); }
    };
    try {
      expect(await nextEvent()).toContain("event: update");
      expect((await PATCH(request({ avatarId: "frog" }), context())).status).toBe(200);
      expect(await nextEvent()).toContain("event: update");
    } finally {
      abort.abort();
      await reader.cancel();
    }
  }, 10000);
});
