import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const globalForSupabase = globalThis as unknown as {
  roomboardAdminClient?: SupabaseClient;
};

export function getSupabaseAdminClient() {
  if (globalForSupabase.roomboardAdminClient) {
    return globalForSupabase.roomboardAdminClient;
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  globalForSupabase.roomboardAdminClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return globalForSupabase.roomboardAdminClient;
}
