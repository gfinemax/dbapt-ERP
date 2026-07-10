import { describe, expect, it } from "vitest";
import { parseBasicInfoSection, shouldEnableBasicInfoRemoteCreate } from "./page";

describe("parseBasicInfoSection", () => {
  it("keeps valid basic info sections from search params", () => {
    expect(parseBasicInfoSection("bank-accounts")).toBe("bank-accounts");
    expect(parseBasicInfoSection("cards")).toBe("cards");
    expect(parseBasicInfoSection("account-subjects")).toBe("account-subjects");
    expect(parseBasicInfoSection(["items"])).toBe("items");
  });

  it("falls back to partner registration for unknown sections", () => {
    expect(parseBasicInfoSection(undefined)).toBe("partners");
    expect(parseBasicInfoSection("unknown")).toBe("partners");
  });

  it("does not enable remote creation when the active Supabase list failed to load", () => {
    expect(shouldEnableBasicInfoRemoteCreate(true, "bank-accounts", "bank-accounts", null)).toBe(false);
    expect(shouldEnableBasicInfoRemoteCreate(true, "bank-accounts", "bank-accounts", [])).toBe(true);
    expect(shouldEnableBasicInfoRemoteCreate(true, "partners", "bank-accounts", null)).toBe(false);
    expect(shouldEnableBasicInfoRemoteCreate(false, "bank-accounts", "bank-accounts", [])).toBe(false);
  });
});
