import { describe, expect, it } from "vitest";
import { itemRepositorySchema, mapItemFromRow } from "./item-repository";

describe("item repository", () => {
  it("uses finance storage and maps rows", () => {
    expect(itemRepositorySchema).toBe("finance");
    expect(mapItemFromRow({ category: "운영비", code: "ITEM-001", description: "인쇄", id: "item-1", name: "인쇄용역", unit: "식", usage_status: "사용" })).toMatchObject({ code: "ITEM-001", name: "인쇄용역", usageStatus: "사용" });
  });
});
