import { z } from "zod";
import { ERROR_CODES } from "@/lib/auth/validation";
import type { Database } from "@/lib/supabase/types";
import { DataApiError, type DataClient, invalidInput, timestampSchema, uuidSchema } from "./api";

export type MessageRecord = Database["public"]["Tables"]["messages"]["Row"];
export const sendMessageSchema = z.object({ clientMessageId: uuidSchema, body: z.string().trim().refine((value) => Array.from(value).length >= 1 && Array.from(value).length <= 2000 && !value.includes("\u0000")) }).strict();
const cursorSchema = z.object({ serverCreatedAt: timestampSchema, id: uuidSchema }).strict();
export type MessageCursor = z.infer<typeof cursorSchema>;

export function parseMessageCursor(value: string | null): MessageCursor | null {
  if (value === null) return null;
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return invalidInput("消息分页位置无效");
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (parsed.success) return parsed.data;
  } catch { /* Invalid JSON has the same public response as invalid fields. */ }
  return invalidInput("消息分页位置无效");
}

function encodeCursor(message: MessageRecord): string {
  return Buffer.from(JSON.stringify({ serverCreatedAt: message.server_created_at, id: message.id })).toString("base64url");
}

export async function listMessages(db: DataClient, conversationId: string, cursor: MessageCursor | null, limit = 50) {
  let query = db.from("messages").select("*").eq("conversation_id", conversationId).order("server_created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (cursor) query = query.or(`server_created_at.lt.${cursor.serverCreatedAt},and(server_created_at.eq.${cursor.serverCreatedAt},id.lt.${cursor.id})`);
  const { data, error } = await query;
  if (error) throw error;
  const page = (data ?? []).slice(0, limit);
  const nextCursor = data && data.length > limit ? encodeCursor(page[page.length - 1]) : null;
  return { messages: page.reverse(), nextCursor };
}

export async function sendMessage(db: DataClient, conversationId: string, memberId: string, input: z.infer<typeof sendMessageSchema>): Promise<{ message: MessageRecord; created: boolean }> {
  const { data, error } = await db.from("messages").insert({ conversation_id: conversationId, sender_id: memberId, client_message_id: input.clientMessageId, body: input.body }).select("*").single();
  if (!error && data) return { message: data, created: true };
  // A retry never updates an existing message. The unique key also closes the
  // race between two requests sent before either receives a response.
  if (error?.code === "23505") {
    const { data: existing, error: readError } = await db.from("messages").select("*").eq("conversation_id", conversationId).eq("sender_id", memberId).eq("client_message_id", input.clientMessageId).single();
    if (readError) throw readError;
    if (existing) {
      if (existing.body !== input.body) throw new DataApiError(ERROR_CODES.CONFLICT, "这条消息的发送标识已被使用，请重新发送", 409);
      return { message: existing, created: false };
    }
  }
  throw error ?? new Error("Message insert returned no row");
}
