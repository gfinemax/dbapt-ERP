import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServerConfig } from "./config";

let cachedClient: SupabaseClient | null = null;
let cachedUrl: string | null = null;
let cachedKey: string | null = null;

export function getSupabaseServerClient() {
  const config = getSupabaseServerConfig();

  if (!config) {
    return null;
  }

  if (!cachedClient || cachedUrl !== config.url || cachedKey !== config.key) {
    cachedUrl = config.url;
    cachedKey = config.key;
    cachedClient = createClient(config.url, config.key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}
