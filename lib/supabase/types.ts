export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      spaces: {
        Row: {
          id: string;
          name: string;
          avatar_id: string | null;
          theme_id: string;
          timezone: string;
          creator_member_id: string | null;
          invite_code_hash: string | null;
          invite_revoked_at: string | null;
          invite_rotated_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["spaces"]["Row"]> &
          Pick<Database["public"]["Tables"]["spaces"]["Row"], "name">;
        Update: Partial<Database["public"]["Tables"]["spaces"]["Row"]>;
        Relationships: [];
      };
      members: {
        Row: {
          id: string;
          space_id: string;
          nickname: string;
          avatar_color: string;
          avatar_id: string | null;
          account_id: string | null;
          role: "creator" | "member";
          removed_at: string | null;
          joined_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["members"]["Row"]> &
          Pick<
            Database["public"]["Tables"]["members"]["Row"],
            "space_id" | "nickname"
          >;
        Update: Partial<Database["public"]["Tables"]["members"]["Row"]>;
        Relationships: [];
      };
      member_sessions: {
        Row: {
          id: string;
          member_id: string;
          token_digest: string;
          expires_at: string;
          revoked_at: string | null;
          last_active_at: string;
          created_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["member_sessions"]["Row"]
        > &
          Pick<
            Database["public"]["Tables"]["member_sessions"]["Row"],
            "member_id" | "token_digest" | "expires_at"
          >;
        Update: Partial<Database["public"]["Tables"]["member_sessions"]["Row"]>;
        Relationships: [];
      };
      app_accounts: {
        Row: {
          id: string;
          email: string;
          nickname: string;
          avatar_id: string | null;
          auth_provider: "local" | "supabase";
          password_hash: string | null;
          verified_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["app_accounts"]["Row"]> &
          Pick<
            Database["public"]["Tables"]["app_accounts"]["Row"],
            "email" | "nickname"
          >;
        Update: Partial<Database["public"]["Tables"]["app_accounts"]["Row"]>;
        Relationships: [];
      };
      account_sessions: {
        Row: {
          id: string;
          account_id: string;
          token_digest: string;
          selected_space_id: string | null;
          expires_at: string;
          revoked_at: string | null;
          last_active_at: string;
          created_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["account_sessions"]["Row"]
        > &
          Pick<
            Database["public"]["Tables"]["account_sessions"]["Row"],
            "account_id" | "token_digest" | "expires_at"
          >;
        Update: Partial<
          Database["public"]["Tables"]["account_sessions"]["Row"]
        >;
        Relationships: [];
      };
      account_tokens: {
        Row: {
          id: string;
          account_id: string;
          token_digest: string;
          purpose: "verify" | "reset";
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["account_tokens"]["Row"]> &
          Pick<
            Database["public"]["Tables"]["account_tokens"]["Row"],
            "account_id" | "token_digest" | "purpose" | "expires_at"
          >;
        Update: Partial<Database["public"]["Tables"]["account_tokens"]["Row"]>;
        Relationships: [];
      };
      account_email_codes: {
        Row: {
          id: string;
          account_id: string;
          code_digest: string;
          attempts: number;
          created_at: string;
          expires_at: string;
          delivered_at: string | null;
          canceled_at: string | null;
          used_at: string | null;
        };
        Insert: Partial<
          Database["public"]["Tables"]["account_email_codes"]["Row"]
        > &
          Pick<
            Database["public"]["Tables"]["account_email_codes"]["Row"],
            "id" | "account_id" | "code_digest"
          >;
        Update: Partial<
          Database["public"]["Tables"]["account_email_codes"]["Row"]
        >;
        Relationships: [];
      };
      daily_logs: {
        Row: {
          id: string;
          space_id: string;
          member_id: string;
          work_date: string;
          slot: "morning" | "afternoon";
          content: string;
          edited_at: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["daily_logs"]["Row"]> &
          Pick<
            Database["public"]["Tables"]["daily_logs"]["Row"],
            "space_id" | "member_id" | "work_date" | "slot"
          >;
        Update: Partial<Database["public"]["Tables"]["daily_logs"]["Row"]>;
        Relationships: [];
      };
      daily_checkins: {
        Row: {
          id: string;
          space_id: string;
          member_id: string;
          work_date: string;
          checked_in_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["daily_checkins"]["Row"]> &
          Pick<
            Database["public"]["Tables"]["daily_checkins"]["Row"],
            "space_id" | "member_id" | "work_date"
          >;
        Update: Partial<Database["public"]["Tables"]["daily_checkins"]["Row"]>;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          space_id: string;
          creator_id: string;
          scope: "personal" | "group";
          assignee_id: string | null;
          assignee_ids: string[] | null;
          title: string;
          notes: string;
          target_date: string | null;
          recurrence: "once" | "daily";
          completed_on: string | null;
          ends_on: string | null;
          source_log_id: string | null;
          completed: boolean;
          completed_at: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tasks"]["Row"]> &
          Pick<
            Database["public"]["Tables"]["tasks"]["Row"],
            "space_id" | "creator_id" | "title"
          >;
        Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>;
        Relationships: [];
      };
      task_completions: {
        Row: {
          id: string;
          space_id: string;
          task_id: string;
          work_date: string;
          completed: boolean;
          completed_at: string | null;
          updated_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["task_completions"]["Row"]
        > &
          Pick<
            Database["public"]["Tables"]["task_completions"]["Row"],
            "space_id" | "task_id" | "work_date"
          >;
        Update: Partial<
          Database["public"]["Tables"]["task_completions"]["Row"]
        >;
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string;
          space_id: string;
          kind: "group" | "direct";
          direct_member_low: string | null;
          direct_member_high: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["conversations"]["Row"]> &
          Pick<
            Database["public"]["Tables"]["conversations"]["Row"],
            "space_id" | "kind"
          >;
        Update: Partial<Database["public"]["Tables"]["conversations"]["Row"]>;
        Relationships: [];
      };
      conversation_members: {
        Row: { conversation_id: string; member_id: string; joined_at: string };
        Insert: Partial<
          Database["public"]["Tables"]["conversation_members"]["Row"]
        > &
          Pick<
            Database["public"]["Tables"]["conversation_members"]["Row"],
            "conversation_id" | "member_id"
          >;
        Update: Partial<
          Database["public"]["Tables"]["conversation_members"]["Row"]
        >;
        Relationships: [];
      };
      conversation_reads: {
        Row: {
          conversation_id: string;
          member_id: string;
          last_read_at: string;
        };
        Insert: Partial<
          Database["public"]["Tables"]["conversation_reads"]["Row"]
        > &
          Pick<
            Database["public"]["Tables"]["conversation_reads"]["Row"],
            "conversation_id" | "member_id"
          >;
        Update: Partial<
          Database["public"]["Tables"]["conversation_reads"]["Row"]
        >;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          client_message_id: string;
          body: string;
          server_created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["messages"]["Row"]> &
          Pick<
            Database["public"]["Tables"]["messages"]["Row"],
            "conversation_id" | "sender_id" | "client_message_id" | "body"
          >;
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_owned_task: {
        Args: {
          p_space_id: string;
          p_member_id: string;
          p_title: string;
          p_notes: string;
          p_target_date: string;
          p_recurrence?: string;
          p_scope?: "personal" | "group";
          p_assignee_ids?: string[] | null;
          p_assignee_id?: string | null;
        };
        Returns: Json;
      };
      update_owned_task: {
        Args: {
          p_space_id: string;
          p_member_id: string;
          p_task_id: string;
          p_updated_at: string;
          p_changes: Json;
        };
        Returns: Json;
      };
      delete_owned_task: {
        Args: {
          p_space_id: string;
          p_member_id: string;
          p_task_id: string;
          p_updated_at: string;
          p_date?: string;
        };
        Returns: boolean;
      };
      delete_space: {
        Args: { p_space_id: string; p_actor_id: string };
        Returns: boolean;
      };
      remove_space_member: {
        Args: { p_space_id: string; p_actor_id: string; p_target_id: string };
        Returns: boolean;
      };
      transfer_space_owner: {
        Args: { p_space_id: string; p_actor_id: string; p_target_id: string };
        Returns: boolean;
      };
      is_active_member: {
        Args: { p_space_id: string; p_member_id: string };
        Returns: boolean;
      };
      can_read_conversation: {
        Args: { p_conversation_id: string; p_member_id: string };
        Returns: boolean;
      };
      can_send_message: {
        Args: { p_conversation_id: string; p_member_id: string };
        Returns: boolean;
      };
      create_space_with_member: {
        Args: {
          p_name: string;
          p_nickname: string;
          p_timezone: string;
          p_invite_hash: string;
          p_token_digest: string;
          p_expires_at: string;
        };
        Returns: Array<{
          space_id: string;
          member_id: string;
          conversation_id: string;
          session_id: string;
        }>;
      };
      join_space_by_invite: {
        Args: {
          p_invite_hash: string;
          p_nickname: string;
          p_token_digest: string;
          p_expires_at: string;
        };
        Returns: Array<{
          space_id: string;
          member_id: string;
          conversation_id: string;
          session_id: string;
        }>;
      };
      claim_legacy_membership: {
        Args: {
          p_account_id: string;
          p_member_id: string;
          p_legacy_session_id: string;
          p_account_session_id: string;
        };
        Returns: boolean;
      };
      complete_account_password_reset: {
        Args: { p_token_digest: string; p_password_hash: string };
        Returns: string | null;
      };
      complete_account_email_verification: {
        Args: { p_token_digest: string };
        Returns: string | null;
      };
      reserve_account_email_code: {
        Args: {
          p_account_id: string;
          p_challenge_id: string;
          p_code_digest: string;
        };
        Returns: Json;
      };
      activate_account_email_code: {
        Args: { p_account_id: string; p_challenge_id: string };
        Returns: boolean;
      };
      cancel_account_email_code: {
        Args: { p_account_id: string; p_challenge_id: string };
        Returns: boolean;
      };
      consume_account_email_code: {
        Args: {
          p_account_id: string;
          p_challenge_id: string;
          p_code_digest: string;
        };
        Returns: string | null;
      };
      create_account_space: {
        Args: {
          p_account_id: string;
          p_name: string;
          p_timezone: string;
          p_invite_hash: string;
          p_avatar_id: string | null;
          p_nickname: string;
        };
        Returns: Array<{ space_id: string; member_id: string }>;
      };
      join_account_space: {
        Args: {
          p_account_id: string;
          p_invite_hash: string;
          p_nickname: string | null;
        };
        Returns: Array<{
          space_id: string;
          member_id: string;
          joined: boolean;
        }>;
      };
      update_account_space: {
        Args: {
          p_space_id: string;
          p_account_id: string;
          p_name: string;
          p_avatar_id: string | null;
          p_theme_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["spaces"]["Row"][];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
