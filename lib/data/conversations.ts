import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ERROR_CODES } from "@/lib/auth/validation";
import type { Database } from "@/lib/supabase/types";
import { DataApiError, type DataClient, uuidSchema } from "./api";

export type ConversationRecord = Database["public"]["Tables"]["conversations"]["Row"];
type ConversationPeer = Pick<Database["public"]["Tables"]["members"]["Row"], "id" | "nickname" | "avatar_id" | "removed_at">;
export type ConversationWithPeer = ConversationRecord & { otherMember: ConversationPeer | null };
export const openConversationSchema = z.object({ memberId: uuidSchema }).strict();
type ChatDatabase = { public: Omit<Database["public"], "Functions"> & { Functions: Database["public"]["Functions"] & { open_direct_conversation: { Args: { p_space_id: string; p_member_id: string; p_other_member_id: string }; Returns: ConversationRecord[] } } } };

async function attachPeers(db: DataClient, conversations: ConversationRecord[], memberId: string): Promise<ConversationWithPeer[]> {
  const peerIds = [...new Set(conversations.filter((item) => item.kind === "direct").map((item) => item.direct_member_low === memberId ? item.direct_member_high! : item.direct_member_low!))];
  let peers: ConversationPeer[] = [];
  if (peerIds.length) {
    const { data, error } = await db.from("members").select("id,nickname,avatar_id,removed_at").in("id", peerIds);
    if (error) throw error;
    peers = data ?? [];
  }
  return conversations.map((item) => ({ ...item, otherMember: item.kind === "group" ? null : peers.find((peer) => peer.id === (item.direct_member_low === memberId ? item.direct_member_high : item.direct_member_low)) ?? null }));
}

export async function listConversations(db: DataClient, spaceId: string, memberId: string): Promise<ConversationWithPeer[]> {
  const { data: memberships, error: memberError } = await db.from("conversation_members").select("conversation_id").eq("member_id", memberId);
  if (memberError) throw memberError;
  if (!memberships?.length) return [];
  const { data, error } = await db.from("conversations").select("*").eq("space_id", spaceId).in("id", memberships.map((row) => row.conversation_id)).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw error;
  const allowed = (data ?? []).filter((item) => item.kind === "group" || item.direct_member_low === memberId || item.direct_member_high === memberId);
  return attachPeers(db, allowed.sort((a, b) => Number(b.kind === "group") - Number(a.kind === "group")), memberId);
}

export async function openDirectConversation(db: DataClient, spaceId: string, memberId: string, otherMemberId: string): Promise<ConversationWithPeer> {
  if (memberId === otherMemberId) throw new DataApiError(ERROR_CODES.INVALID_INPUT, "请选择另一位成员", 400);
  const { data: peer, error: peerError } = await db.from("members").select("id,nickname,avatar_id,removed_at").eq("space_id", spaceId).eq("id", otherMemberId).is("removed_at", null).maybeSingle();
  if (peerError) throw peerError;
  if (!peer) throw new DataApiError(ERROR_CODES.FORBIDDEN, "对方已不在这个空间中", 403);
  const client = db as unknown as SupabaseClient<ChatDatabase>;
  const { data, error } = await client.rpc("open_direct_conversation", { p_space_id: spaceId, p_member_id: memberId, p_other_member_id: otherMemberId });
  if (error) {
    if (error.code === "42501") throw new DataApiError(ERROR_CODES.FORBIDDEN, "无法访问这个会话，请刷新成员列表", 403);
    throw error;
  }
  if (!data?.[0]) throw new Error("Conversation transaction returned no row");
  return { ...data[0], otherMember: peer };
}

export async function requireConversationAccess(db: DataClient, spaceId: string, conversationId: string, memberId: string): Promise<ConversationRecord> {
  const { data: conversation, error } = await db.from("conversations").select("*").eq("id", conversationId).eq("space_id", spaceId).maybeSingle();
  if (error) throw error;
  if (!conversation || (conversation.kind === "direct" && conversation.direct_member_low !== memberId && conversation.direct_member_high !== memberId)) throw new DataApiError(ERROR_CODES.FORBIDDEN, "无权访问这个会话", 403);
  const { data: membership, error: memberError } = await db.from("conversation_members").select("member_id").eq("conversation_id", conversationId).eq("member_id", memberId).maybeSingle();
  if (memberError) throw memberError;
  if (!membership) throw new DataApiError(ERROR_CODES.FORBIDDEN, "无权访问这个会话", 403);
  return conversation;
}
