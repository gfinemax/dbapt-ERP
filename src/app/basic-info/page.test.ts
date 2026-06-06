import { describe, expect, it } from "vitest";
import { parseBasicInfoSection } from "./page";

describe("parseBasicInfoSection", () => {
  it("keeps valid basic info sections from search params", () => {
    expect(parseBasicInfoSection("bank-accounts")).toBe("bank-accounts");
    expect(parseBasicInfoSection("cards")).toBe("cards");
    expect(parseBasicInfoSection(["items"])).toBe("items");
  });

  it("falls back to partner registration for unknown sections", () => {
    expect(parseBasicInfoSection(undefined)).toBe("partners");
    expect(parseBasicInfoSection("unknown")).toBe("partners");
  });
});
