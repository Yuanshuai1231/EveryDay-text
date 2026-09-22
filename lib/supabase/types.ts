export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      spaces: { Row: { id: string; name: string; timezone: string; creator_member_id: string | null; invite_code_hash: string | null; invite_revoked_at: string | null; invite_rotated_at: string | null; created_at: string }; Insert: Partial<Database["public"]["Tables"]["spaces"]["Row"]> & Pick<Database["public"]["Tables"]["spaces"]["Row"], "name">; Update: Partial<Database["public"]["Tables"]["spaces"]["Row"]>; Relationships: [] };
      members: { Row: { id: string; space_id: string; nickname: string; avatar_color: string; role: "creator" | "member"; removed_at: string | null; joined_at: string }; Insert: Partial<Database["public"]["Tables"]["members"]["Row"]> & Pick<Database["public"]["Tables"]["members"]["Row"], "space_id" | "nickname">; Update: Partial<Database["public"]["Tables"]["members"]["Row"]>; Relationships: [] };
      member_sessions: { Row: { id: string; member_id: string; token_digest: string; expires_at: string; revoked_at: string | null; last_active_at: string; created_at: string }; Insert: Partial<Database["public"]["Tables"]["member_sessions"]["Row"]> & Pick<Database["public"]["Tables"]["member_sessions"]["Row"], "member_id" | "token_digest" | "expires_at">; Update: Partial<Database["public"]["Tables"]["member_sessions"]["Row"]>; Relationships: [] };
      daily_logs: { Row: { id: string; space_id: string; member_id: string; work_date: string; slot: "morning" | "afternoon"; content: string; edited_at: string; created_at: string }; Insert: Partial<Database["public"]["Tables"]["daily_logs"]["Row"]> & Pick<Database["public"]["Tables"]["daily_logs"]["Row"], "space_id" | "member_id" | "work_date" | "slot">; Update: Partial<Database["public"]["Tables"]["daily_logs"]["Row"]>; Relationships: [] };
      daily_checkins: { Row: { id: string; space_id: string; member_id: string; work_date: string; checked_in_at: string }; Insert: Partial<Database["public"]["Tables"]["daily_checkins"]["Row"]> & Pick<Database["public"]["Tables"]["daily_checkins"]["Row"], "space_id" | "member_id" | "work_date">; Update: Partial<Database["public"]["Tables"]["daily_checkins"]["Row"]>; Relationships: [] };
      tasks: { Row: { id: string; space_id: string; creator_id: string; title: string; notes: string; target_date: string | null; completed: boolean; completed_at: string | null; updated_at: string; created_at: string }; Insert: Partial<Database["public"]["Tables"]["tasks"]["Row"]> & Pick<Database["public"]["Tables"]["tasks"]["Row"], "space_id" | "creator_id" | "title">; Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>; Relationships: [] };
      conversations: { Row: { id: string; space_id: string; kind: "group" | "direct"; direct_member_low: string | null; direct_member_high: string | null; created_at: string }; Insert: Partial<Database["public"]["Tables"]["conversations"]["Row"]> & Pick<Database["public"]["Tables"]["conversations"]["Row"], "space_id" | "kind">; Update: Partial<Database["public"]["Tables"]["conversations"]["Row"]>; Relationships: [] };
      conversation_members: { Row: { conversation_id: string; member_id: string; joined_at: string }; Insert: Partial<Database["public"]["Tables"]["conversation_members"]["Row"]> & Pick<Database["public"]["Tables"]["conversation_members"]["Row"], "conversation_id" | "member_id">; Update: Partial<Database["public"]["Tables"]["conversation_members"]["Row"]>; Relationships: [] };
      messages: { Row: { id: string; conversation_id: string; sender_id: string; client_message_id: string; body: string; server_created_at: string }; Insert: Partial<Database["public"]["Tables"]["messages"]["Row"]> & Pick<Database["public"]["Tables"]["messages"]["Row"], "conversation_id" | "sender_id" | "client_message_id" | "body">; Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: {
      remove_space_member: { Args: { p_space_id: string; p_actor_id: string; p_target_id: string }; Returns: boolean };
      transfer_space_owner: { Args: { p_space_id: string; p_actor_id: string; p_target_id: string }; Returns: boolean };
      is_active_member: { Args: { p_space_id: string; p_member_id: string }; Returns: boolean };
      can_read_conversation: { Args: { p_conversation_id: string; p_member_id: string }; Returns: boolean };
      can_send_message: { Args: { p_conversation_id: string; p_member_id: string }; Returns: boolean };
      create_space_with_member: { Args: { p_name: string; p_nickname: string; p_timezone: string; p_invite_hash: string; p_token_digest: string; p_expires_at: string }; Returns: Array<{ space_id: string; member_id: string; conversation_id: string; session_id: string }> };
      join_space_by_invite: { Args: { p_invite_hash: string; p_nickname: string; p_token_digest: string; p_expires_at: string }; Returns: Array<{ space_id: string; member_id: string; conversation_id: string; session_id: string }> };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

