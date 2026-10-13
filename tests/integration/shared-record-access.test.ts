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
import { GET, PUT } from "@/app/api/spaces/[spaceId]/logs/route";
import {
  listConversations,
  openDirectConversation,
} from "@/lib/data/conversations";
import type { DataClient } from "@/lib/data/api";

const auth = vi.hoisted(() => ({
  token: "",
  client: null as DataClient | null,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => name === "daily_member_session" ? ({ value: auth.token }) : undefined }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => auth.client,
}));
let database: PGlite;
let space: string, alice: string, bob: string;
const date = "2026-10-13";
function context() {
  return { params: Promise.resolve({ spaceId: space }) };
}
function request(method: string, body?: unknown, day = date) {
  return new NextRequest(
    `https://checkin.example/api/spaces/${space}/logs?date=${day}`,
    {
      method,
      headers: {
        origin: "https://checkin.example",
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
async function create(name: string, invite: string, token: string) {
  return (
    await database.query<{ space_id: string; member_id: string }>(
      "select * from create_space_with_member($1,$2,$3,$4,$5,$6)",
      [
        name,
        name,
        "Asia/Shanghai",
        invite.repeat(64),
        digestToken(token),
        "2030-01-01",
      ],
    )
  ).rows[0];
}
beforeAll(async () => {
  database = new PGlite();
  await database.waitReady;
  await applyMigrations(database);
  auth.client = createClient("http://local.test", "test", {
    auth: { persistSession: false },
    global: { fetch: makeLocalFetch(async () => database) },
  }) as DataClient;
  const created = await create("小熊", "a", "alice-session");
  space = created.space_id;
  alice = created.member_id;
  bob = (
    await database.query<{ member_id: string }>(
      "select * from join_space_by_invite($1,$2,$3,$4)",
      ["a".repeat(64), "小兔", digestToken("bob-session"), "2030-01-01"],
    )
  ).rows[0].member_id;
  await create("另一组", "c", "outsider-session");
}, 60000);
beforeEach(() => {
  auth.token = "alice-session";
});
afterAll(async () => {
  await database?.close();
});

describe("shared records with actual session and storage boundaries", () => {
  it("makes both members' automatically saved records readable before completing check-in", async () => {
    const first = await PUT(
      request("PUT", {
        date,
        slot: "morning",
        content: "小熊上午读书",
        editedAt: null,
      }),
      context(),
    );
    expect(first.status).toBe(200);
    auth.token = "bob-session";
    const second = await PUT(
      request("PUT", {
        date,
        slot: "afternoon",
        content: "小兔下午运动",
        editedAt: null,
      }),
      context(),
    );
    expect(second.status).toBe(200);
    const result = await (await GET(request("GET"), context())).json();
    expect(
      result.logs.map((log: { content: string }) => log.content).sort(),
    ).toEqual(["小兔下午运动", "小熊上午读书"].sort());
    expect(
      (
        await database.query("select * from daily_checkins where space_id=$1", [
          space,
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it("filters records to the requested historical date", async () => {
    const historical = "2026-10-12";
    expect(
      (
        await PUT(
          request("PUT", {
            date: historical,
            slot: "morning",
            content: "昨天的记录",
            editedAt: null,
          }),
          context(),
        )
      ).status,
    ).toBe(200);
    const result = await (
      await GET(request("GET", undefined, historical), context())
    ).json();
    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].content).toBe("昨天的记录");
  });

  it("derives the author from the session even if another member id is supplied", async () => {
    const saved = await PUT(
      request("PUT", {
        date: "2026-10-11",
        slot: "morning",
        content: "自己的记录",
        editedAt: null,
        memberId: bob,
      }),
      context(),
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).log.member_id).toBe(alice);
  });

  it("blocks a member of another space from reading and writing", async () => {
    auth.token = "outsider-session";
    expect((await GET(request("GET"), context())).status).toBe(403);
    expect(
      (
        await PUT(
          request("PUT", {
            date,
            slot: "morning",
            content: "越权记录",
            editedAt: null,
          }),
          context(),
        )
      ).status,
    ).toBe(403);
  });

  it("blocks revoked sessions from reading shared content", async () => {
    await database.query(
      "update member_sessions set revoked_at=now() where token_digest=$1",
      [digestToken("bob-session")],
    );
    auth.token = "bob-session";
    expect((await GET(request("GET"), context())).status).toBe(401);
  });

  it("includes the chosen animal avatar when listing a private conversation", async () => {
    await database.query("update members set avatar_id='rabbit' where id=$1", [
      bob,
    ]);
    await openDirectConversation(auth.client!, space, alice, bob);
    const conversations = await listConversations(auth.client!, space, alice);
    const peer = conversations.find(
      (item) => item.kind === "direct",
    )?.otherMember;
    expect(peer).toMatchObject({ id: bob, avatar_id: "rabbit" });
  });
});
