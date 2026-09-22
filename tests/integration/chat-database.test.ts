// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyMigrations } from "@/lib/local/database";
import { makeLocalFetch } from "@/lib/local/fetch";
import type { Database } from "@/lib/supabase/types";
import { listConversations, openDirectConversation, requireConversationAccess } from "@/lib/data/conversations";
import { listMessages, parseMessageCursor, sendMessage } from "@/lib/data/messages";
import { createTask, updateTask } from "@/lib/data/tasks";

let db: PGlite;
let client: SupabaseClient<Database>;
let spaceId: string, aliceId: string, bobId: string, eveId: string;
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await applyMigrations(db);
  client = createClient<Database>("http://local.test", "test", { auth: { persistSession: false }, global: { fetch: makeLocalFetch(async () => db) } });
}, 60000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  const invite = randomBytes(32).toString("hex");
  const created = await client.rpc("create_space_with_member", { p_name: "聊天测试", p_nickname: "Alice", p_timezone: "Asia/Shanghai", p_invite_hash: invite, p_token_digest: randomBytes(32).toString("hex"), p_expires_at: "2099-01-01T00:00:00Z" });
  if (created.error) throw created.error;
  spaceId = created.data[0].space_id; aliceId = created.data[0].member_id;
  const join = async (name: string) => {
    const result = await client.rpc("join_space_by_invite", { p_invite_hash: invite, p_nickname: name, p_token_digest: randomBytes(32).toString("hex"), p_expires_at: "2099-01-01T00:00:00Z" });
    if (result.error) throw result.error;
    return result.data[0].member_id;
  };
  bobId = await join("Bob"); eveId = await join("Eve");
});

describe("chat and task behavior through real PostgreSQL", () => {
  it("concurrent opens from both participants produce one normalized direct conversation", async () => {
    const opened = await Promise.all([
      openDirectConversation(client, spaceId, aliceId, bobId),
      openDirectConversation(client, spaceId, bobId, aliceId),
      openDirectConversation(client, spaceId, aliceId, bobId),
    ]);
    expect(new Set(opened.map((conversation) => conversation.id)).size).toBe(1);
    expect(opened[0].direct_member_low).toBe([aliceId, bobId].sort()[0]);
    expect(opened[0].otherMember?.nickname).toBe("Bob");
    const memberships = await client.from("conversation_members").select("member_id").eq("conversation_id", opened[0].id);
    expect(memberships.error).toBeNull();
    expect(memberships.data?.map((row) => row.member_id).sort()).toEqual([aliceId, bobId].sort());
  });

  it("the database rejects a third member joining or sending into a direct conversation", async () => {
    const conversation = await openDirectConversation(client, spaceId, aliceId, bobId);
    const added = await client.from("conversation_members").insert({ conversation_id: conversation.id, member_id: eveId });
    expect(added.error).not.toBeNull();
    await expect(requireConversationAccess(client, spaceId, conversation.id, eveId)).rejects.toMatchObject({ status: 403 });
    await expect(sendMessage(client, conversation.id, eveId, { clientMessageId: randomUUID(), body: "intrusion" })).rejects.toBeTruthy();
    const eveConversations = await listConversations(client, spaceId, eveId);
    expect(eveConversations.every((row) => row.kind === "group")).toBe(true);
    expect((await client.from("messages").select("id").eq("conversation_id", conversation.id)).data).toEqual([]);
  });

  it("concurrent message retries persist one message and return its original body", async () => {
    const conversation = await openDirectConversation(client, spaceId, aliceId, bobId);
    const clientMessageId = randomUUID();
    const results = await Promise.all([
      sendMessage(client, conversation.id, aliceId, { clientMessageId, body: "hello" }),
      sendMessage(client, conversation.id, aliceId, { clientMessageId, body: "hello" }),
    ]);
    expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    await expect(sendMessage(client, conversation.id, aliceId, { clientMessageId, body: "replacement" })).rejects.toMatchObject({ status: 409 });
    expect((await client.from("messages").select("id").eq("conversation_id", conversation.id)).data).toHaveLength(1);
  });

  it("keeps every message when timestamps share PostgreSQL microseconds", async () => {
    const conversation = await openDirectConversation(client, spaceId, aliceId, bobId);
    const inserted = await client.from("messages").insert([1, 2, 3].map((index) => ({ id: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}`, conversation_id: conversation.id, sender_id: aliceId, client_message_id: randomUUID(), body: String(index), server_created_at: "2026-09-22T01:02:03.123456Z" })));
    expect(inserted.error).toBeNull();
    const first = await listMessages(client, conversation.id, null, 2);
    expect(first.messages.map((message) => message.body)).toEqual(["2", "3"]);
    const second = await listMessages(client, conversation.id, parseMessageCursor(first.nextCursor), 2);
    expect(second.messages.map((message) => message.body)).toEqual(["1"]);
    expect(second.nextCursor).toBeNull();
  });

  it("task versions can be read back and used for a conditional update", async () => {
    const task = await createTask(client, spaceId, aliceId, { title: "work", notes: "", targetDate: "2026-09-22" });
    const updated = await updateTask(client, spaceId, task.id, aliceId, { completed: true, updatedAt: task.updated_at });
    expect(updated.completed).toBe(true);
    await expect(updateTask(client, spaceId, task.id, aliceId, { completed: false, updatedAt: task.updated_at })).rejects.toMatchObject({ status: 409 });
  });

  it("RPC rechecks active members even when called directly", async () => {
    await db.query("UPDATE public.members SET removed_at=now() WHERE id=$1", [bobId]);
    await expect(db.query("SELECT * FROM public.open_direct_conversation($1,$2,$3)", [spaceId, aliceId, bobId])).rejects.toMatchObject({ code: "42501" });
    const count = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.conversations WHERE space_id=$1 AND kind='direct'", [spaceId]);
    expect(count.rows[0].count).toBe(0);
  });
});
