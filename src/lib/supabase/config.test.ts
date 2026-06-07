import { describe, expect, it } from "vitest";
import { getSupabaseServerConfig, isSupabaseServerConfigured } from "./config";

describe("supabase config", () => {
  it("detects missing Supabase server settings", () => {
    expect(isSupabaseServerConfigured({})).toBe(false);
    expect(isSupabaseServerConfigured({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" })).toBe(false);
  });

  it("reads Supabase server settings without exposing the secret key name to clients", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://dbapt.supabase.co",
      SUPABASE_SECRET_KEY: "secret-value",
    };

    expect(isSupabaseServerConfigured(env)).toBe(true);
    expect(getSupabaseServerConfig(env)).toEqual({
      key: "secret-value",
      url: "https://dbapt.supabase.co",
    });
  });
});
