// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ current: null as Record<string, unknown> | null, db: null as unknown }));
vi.mock("@/lib/auth/session", () => ({ getCurrentSession: vi.fn(async () => auth.current) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => auth.db }));

type Row = Record<string, unknown>;
const ids = {
  space: "10000000-0000-4000-8000-000000000001", otherSpace: "10000000-0000-4000-8000-000000000002",
  alice: "20000000-0000-4000-8000-000000000001", bob: "20000000-0000-4000-8000-000000000002", eve: "20000000-0000-4000-8000-000000000003",
  task: "30000000-0000-4000-8000-000000000001", group: "40000000-0000-4000-8000-000000000001", direct: "40000000-0000-4000-8000-000000000002",
  client: "50000000-0000-4000-8000-000000000001",
};
const time = "2026-09-22T02:00:00.000Z";
let rows: Record<string, Row[]>;
let sequence = 0;

// The fake preserves database filtering, conditional mutations and unique
// message inserts; the route/data modules and their validation remain real.
function makeDb() {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const ordering: Array<{ key: string; ascending: boolean }> = [];
      let mode = "select", payload: Row | Row[] = {}, count = Infinity;
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
        lte(key: string, value: unknown) { filters.push((row) => row[key] !== null && String(row[key]) <= String(value)); return query; },
        is(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
        in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
        or(expression: string) {
          const match = expression.match(/^server_created_at\.lt\.(.+),and\(server_created_at\.eq\.(.+),id\.lt\.(.+)\)$/);
          if (!match) throw new Error(`Unexpected cursor filter: ${expression}`);
          filters.push((row) => String(row.server_created_at) < match[1] || (row.server_created_at === match[2] && String(row.id) < match[3]));
          return query;
        },
        order(key: string, opts?: { ascending?: boolean }) { ordering.push({ key, ascending: opts?.ascending ?? true }); return query; },
        limit(value: number) { count = value; return query; },
        insert(value: Row | Row[]) { mode = "insert"; payload = value; return query; },
        update(value: Row) { mode = "update"; payload = value; return query; },
        delete() { mode = "delete"; return query; },
        async maybeSingle() { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; },
        async single() { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; },
        then(resolve: (value: ReturnType<typeof execute>) => unknown, reject: (reason: unknown) => unknown) { return Promise.resolve().then(execute).then(resolve, reject); },
      };
      function execute(): { data: Row[] | null; error: { code: string } | null } {
        let found = (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        if (mode === "insert") {
          const inserted: Row[] = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ id: `60000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`, created_at: time, updated_at: time, server_created_at: time, completed: false, completed_at: null, ...row }));
          if (table === "messages" && inserted.some((item) => rows.messages.some((row) => row.conversation_id === item.conversation_id && row.sender_id === item.sender_id && row.client_message_id === item.client_message_id))) return { data: null, error: { code: "23505" } };
          rows[table] = [...(rows[table] ?? []), ...inserted]; found = inserted;
        } else if (mode === "update") found.forEach((row) => Object.assign(row, payload));
        else if (mode === "delete") rows[table] = rows[table].filter((row) => !found.includes(row));
        found = [...found].sort((a, b) => {
          for (const order of ordering) {
            const value = String(a[order.key]).localeCompare(String(b[order.key]));
            if (value) return order.ascending ? value : -value;
          }
          return 0;
        });
        return { data: found.slice(0, count), error: null };
      }
      return query;
    },
    async rpc(name: string, args: Row) {
      if (name === "create_owned_task") {
        const task = { id: `60000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`, created_at: time, updated_at: time, completed: false, completed_at: null, completed_on: null, ends_on: null, source_log_id: null, space_id: args.p_space_id, creator_id: args.p_member_id, title: args.p_title, notes: args.p_notes, target_date: args.p_target_date, recurrence: args.p_recurrence };
        rows.tasks.push(task);
        return { data: { ...task, occurrence_date: task.target_date, overdue: false }, error: null };
      }
      if (name === "update_owned_task" || name === "delete_owned_task") {
        const task = rows.tasks.find(row => row.id === args.p_task_id && row.space_id === args.p_space_id);
        if (!task) return { data: null, error: { code: "P0002", message: "TASK_NOT_FOUND" } };
        if (task.creator_id !== args.p_member_id) return { data: null, error: { code: "42501", message: "TASK_NOT_OWNER" } };
        if (task.updated_at !== args.p_updated_at) return { data: null, error: { code: "40001", message: "TASK_VERSION_CONFLICT" } };
        if (name === "delete_owned_task") { rows.tasks = rows.tasks.filter(row => row !== task); return { data: true, error: null }; }
        const changes = args.p_changes as Row;
        task.updated_at = new Date(Math.max(Date.now(), Date.parse(String(task.updated_at)) + 1)).toISOString();
        for (const field of ["title", "notes"]) if (changes[field] !== undefined) task[field] = changes[field];
        if (changes.targetDate !== undefined) task.target_date = changes.targetDate;
        if (changes.completed !== undefined) { task.completed = changes.completed; task.completed_on = changes.completed ? changes.date ?? task.target_date : null; task.completed_at = changes.completed ? task.completed_at ?? task.updated_at : null; }
        return { data: { ...task, occurrence_date: changes.date ?? task.target_date, overdue: false }, error: null };
      }
      if (name !== "open_direct_conversation") throw new Error(`Unexpected RPC: ${name}`);
      const pair = [String(args.p_member_id), String(args.p_other_member_id)].sort();
      let conversation = rows.conversations.find((row) => row.kind === "direct" && row.direct_member_low === pair[0] && row.direct_member_high === pair[1]);
      if (!conversation) {
        conversation = { id: ids.direct, space_id: args.p_space_id, kind: "direct", direct_member_low: pair[0], direct_member_high: pair[1], created_at: time };
        rows.conversations.push(conversation);
        pair.forEach((member_id) => rows.conversation_members.push({ conversation_id: ids.direct, member_id }));
      }
      return { data: [conversation], error: null };
    },
  };
}

function request(path: string, method = "GET", body?: unknown, origin = "http://localhost") {
  return new NextRequest(`http://localhost${path}`, { method, headers: { origin, "content-type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
const spaceContext = () => ({ params: Promise.resolve({ spaceId: ids.space }) });
const taskContext = () => ({ params: Promise.resolve({ spaceId: ids.space, taskId: ids.task }) });
const chatContext = (conversationId = ids.group) => ({ params: Promise.resolve({ conversationId }) });
beforeEach(() => {
  sequence = 0;
  auth.current = { member_id: ids.alice, space_id: ids.space, expires_at: "2099-01-01T00:00:00Z", revoked_at: null, member_removed_at: null };
  rows = {
    members: [{ id: ids.alice, space_id: ids.space, nickname: "Alice", removed_at: null }, { id: ids.bob, space_id: ids.space, nickname: "Bob", removed_at: null }, { id: ids.eve, space_id: ids.space, nickname: "Eve", removed_at: null }],
    tasks: [{ id: ids.task, space_id: ids.space, creator_id: ids.alice, title: "Read", notes: "", target_date: "2026-09-22", recurrence: "once", completed_on: null, ends_on: null, source_log_id: null, completed: false, completed_at: null, updated_at: time, created_at: time }],
    conversations: [{ id: ids.group, space_id: ids.space, kind: "group", direct_member_low: null, direct_member_high: null, created_at: time }],
    conversation_members: [{ conversation_id: ids.group, member_id: ids.alice }, { conversation_id: ids.group, member_id: ids.bob }],
    messages: [],
  };
  auth.db = makeDb();
});

describe("task route ownership and conditional writes", () => {
  it("reads only selected space and includes unfinished earlier dates", async () => {
    const { GET } = await import("@/app/api/spaces/[spaceId]/tasks/route");
    rows.tasks.push({ ...rows.tasks[0], id: "different-date", target_date: "2026-09-21" }, { ...rows.tasks[0], id: "different-space", space_id: ids.otherSpace });
    const response = await GET(request("/?date=2026-09-22"), spaceContext());
    expect(response.status).toBe(200);
    expect((await response.json()).tasks.map((task: Row) => task.id)).toEqual([ids.task, "different-date"]);
  });
  it("rejects removed membership even when an earlier session check passed", async () => {
    const { GET } = await import("@/app/api/spaces/[spaceId]/tasks/route");
    rows.members[0].removed_at = time;
    expect((await GET(request("/?date=2026-09-22"), spaceContext())).status).toBe(403);
  });
  it("rejects cross-space reads", async () => {
    const { GET } = await import("@/app/api/spaces/[spaceId]/tasks/route");
    auth.current!.space_id = ids.otherSpace;
    expect((await GET(request("/?date=2026-09-22"), spaceContext())).status).toBe(403);
  });
  it.each([null, [], {}, { title: " " }, { title: "a", targetDate: "2026-02-30" }])("rejects invalid create body %j", async (body) => {
    const { POST } = await import("@/app/api/spaces/[spaceId]/tasks/route");
    expect((await POST(request("/", "POST", body), spaceContext())).status).toBe(400);
    expect(rows.tasks).toHaveLength(1);
  });
  it("creates task with server-owned creator and rejects foreign Origin", async () => {
    const { POST } = await import("@/app/api/spaces/[spaceId]/tasks/route");
    expect((await POST(request("/", "POST", { title: "hello" }, "https://hostile.example"), spaceContext())).status).toBe(403);
    const response = await POST(request("/", "POST", { title: "  复盘  ", targetDate: "2026-09-22" }), spaceContext());
    expect(response.status).toBe(201);
    expect((await response.json()).task).toMatchObject({ creator_id: ids.alice, title: "复盘", space_id: ids.space });
  });
  it("refuses another member's task update and deletion", async () => {
    const { PATCH, DELETE } = await import("@/app/api/spaces/[spaceId]/tasks/[taskId]/route");
    rows.tasks[0].creator_id = ids.bob;
    expect((await PATCH(request("/", "PATCH", { updatedAt: time, completed: true }), taskContext())).status).toBe(403);
    expect((await DELETE(request(`/?updatedAt=${encodeURIComponent(time)}`, "DELETE"), taskContext())).status).toBe(403);
    expect(rows.tasks[0].completed).toBe(false);
    expect(rows.tasks).toHaveLength(1);
  });
  it("detects stale edits and can complete then reopen owned tasks", async () => {
    const { PATCH } = await import("@/app/api/spaces/[spaceId]/tasks/[taskId]/route");
    expect((await PATCH(request("/", "PATCH", { updatedAt: "2020-01-01T00:00:00.000Z", completed: true }), taskContext())).status).toBe(409);
    const completed = await PATCH(request("/", "PATCH", { updatedAt: time, completed: true }), taskContext());
    expect(completed.status).toBe(200);
    const task = (await completed.json()).task;
    expect(task.completed_at).not.toBeNull();
    const reopened = await PATCH(request("/", "PATCH", { updatedAt: task.updated_at, completed: false }), taskContext());
    expect((await reopened.json()).task).toMatchObject({ completed: false, completed_at: null });
  });
  it("requires a version and at least one patch field", async () => {
    const { PATCH, DELETE } = await import("@/app/api/spaces/[spaceId]/tasks/[taskId]/route");
    expect((await PATCH(request("/", "PATCH", { completed: true }), taskContext())).status).toBe(400);
    expect((await PATCH(request("/", "PATCH", { updatedAt: time }), taskContext())).status).toBe(400);
    expect((await DELETE(request("/", "DELETE"), taskContext())).status).toBe(400);
  });
  it("deletes an owned task only when the supplied version still matches", async () => {
    const { DELETE } = await import("@/app/api/spaces/[spaceId]/tasks/[taskId]/route");
    expect((await DELETE(request("/?updatedAt=2020-01-01T00%3A00%3A00.000Z", "DELETE"), taskContext())).status).toBe(409);
    expect(rows.tasks).toHaveLength(1);
    const response = await DELETE(request(`/?updatedAt=${encodeURIComponent(time)}`, "DELETE"), taskContext());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rows.tasks).toHaveLength(0);
  });
});

describe("conversation and message routes", () => {
  it("opens one direct conversation on repeated requests and returns the peer", async () => {
    const { POST, GET } = await import("@/app/api/spaces/[spaceId]/conversations/route");
    const first = await POST(request("/", "POST", { memberId: ids.bob }), spaceContext());
    const second = await POST(request("/", "POST", { memberId: ids.bob }), spaceContext());
    expect(first.status).toBe(200);
    expect((await first.json()).conversation.id).toBe((await second.json()).conversation.id);
    expect(rows.conversations.filter((row) => row.kind === "direct")).toHaveLength(1);
    const result = await GET(request("/"), spaceContext());
    expect((await result.json()).conversations.find((row: Row) => row.kind === "direct").otherMember).toMatchObject({ id: ids.bob, nickname: "Bob" });
  });
  it("rejects a removed peer and self conversations", async () => {
    const { POST } = await import("@/app/api/spaces/[spaceId]/conversations/route");
    rows.members[1].removed_at = time;
    expect((await POST(request("/", "POST", { memberId: ids.bob }), spaceContext())).status).toBe(403);
    expect((await POST(request("/", "POST", { memberId: ids.alice }), spaceContext())).status).toBe(400);
  });
  it("denies a third participant both message reads and sends", async () => {
    const { GET, POST } = await import("@/app/api/conversations/[conversationId]/messages/route");
    rows.conversations[0] = { ...rows.conversations[0], kind: "direct", direct_member_low: ids.alice, direct_member_high: ids.bob };
    // Even a corrupted membership row must not make a third member a DM peer.
    rows.conversation_members.push({ conversation_id: ids.group, member_id: ids.eve });
    auth.current!.member_id = ids.eve;
    expect((await GET(request("/"), chatContext())).status).toBe(403);
    expect((await POST(request("/", "POST", { clientMessageId: ids.client, body: "secret" }), chatContext())).status).toBe(403);
    expect(rows.messages).toHaveLength(0);
  });
  it.each([null, [], {}, { body: " " }, { clientMessageId: ids.client, body: " ", senderId: ids.bob }, { clientMessageId: ids.client, body: "a".repeat(2001) }])("rejects invalid message body %j", async (body) => {
    const { POST } = await import("@/app/api/conversations/[conversationId]/messages/route");
    expect((await POST(request("/", "POST", body), chatContext())).status).toBe(400);
    expect(rows.messages).toHaveLength(0);
  });
  it("returns the original message on retries, without duplicating it", async () => {
    const { POST } = await import("@/app/api/conversations/[conversationId]/messages/route");
    const first = await POST(request("/", "POST", { clientMessageId: ids.client, body: "first message" }), chatContext());
    const retry = await POST(request("/", "POST", { clientMessageId: ids.client, body: "first message" }), chatContext());
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect((await retry.json()).message).toEqual((await first.json()).message);
    expect(rows.messages).toHaveLength(1);
    expect(rows.messages[0].body).toBe("first message");
  });
  it("rejects reusing a client message id for different text", async () => {
    const { POST } = await import("@/app/api/conversations/[conversationId]/messages/route");
    await POST(request("/", "POST", { clientMessageId: ids.client, body: "original" }), chatContext());
    const response = await POST(request("/", "POST", { clientMessageId: ids.client, body: "replacement" }), chatContext());
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
    expect(rows.messages).toHaveLength(1);
    expect(rows.messages[0].body).toBe("original");
  });
  it("paginates equal timestamps using id and never repeats a message", async () => {
    const { GET } = await import("@/app/api/conversations/[conversationId]/messages/route");
    rows.messages = [1, 2, 3].map((index) => ({ id: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`, conversation_id: ids.group, sender_id: ids.alice, client_message_id: ids.client, body: String(index), server_created_at: time }));
    const first = await (await GET(request("/?limit=2"), chatContext())).json();
    expect(first.messages.map((row: Row) => row.body)).toEqual(["2", "3"]);
    const second = await (await GET(request(`/?limit=2&cursor=${first.nextCursor}`), chatContext())).json();
    expect(second.messages.map((row: Row) => row.body)).toEqual(["1"]);
    expect(second.nextCursor).toBeNull();
  });
  it("rejects forged cursors and missing sessions", async () => {
    const { GET } = await import("@/app/api/conversations/[conversationId]/messages/route");
    expect((await GET(request("/?cursor=invalid"), chatContext())).status).toBe(400);
    auth.current = null;
    expect((await GET(request("/"), chatContext())).status).toBe(401);
  });
});
