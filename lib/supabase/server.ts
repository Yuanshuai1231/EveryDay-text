import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { makeLocalFetch } from "@/lib/local/fetch";

export function createSupabaseAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.CHECKIN_STORAGE === "supabase" || url) {
    if (!url || !key) throw new Error("请配置 Supabase URL 和服务端密钥。");
    return createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  }
  return createClient<Database>("http://local-postgres.invalid","local-server-only",{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:makeLocalFetch()},
  });
}

