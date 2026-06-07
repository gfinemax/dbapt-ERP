type SupabaseEnv = Record<string, string | undefined>;

export type SupabaseServerConfig = {
  key: string;
  url: string;
};

function readEnv(env?: SupabaseEnv): SupabaseEnv {
  return env ?? process.env;
}

export function getSupabaseServerConfig(env?: SupabaseEnv): SupabaseServerConfig | null {
  const source = readEnv(env);
  const url = source.NEXT_PUBLIC_SUPABASE_URL;
  const key = source.SUPABASE_SECRET_KEY ?? source.SUPABASE_SERVICE_ROLE_KEY ?? source.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? source.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return { key, url };
}

export function isSupabaseServerConfigured(env?: SupabaseEnv) {
  return getSupabaseServerConfig(env) !== null;
}

export function hasSupabaseSecretConfig(env?: SupabaseEnv) {
  const source = readEnv(env);

  return Boolean(source.NEXT_PUBLIC_SUPABASE_URL && (source.SUPABASE_SECRET_KEY || source.SUPABASE_SERVICE_ROLE_KEY));
}
