import { describe, expect, it, vi } from "vitest";
import PaymentRoute from "./page";
const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
describe("legacy payment route", () => {
  it("preserves search context and opens the corresponding payment tab", async () => {
    await PaymentRoute({ searchParams: Promise.resolve({ q: "문서 & 검색", from: ["one", "two"], tab: "wrong" }) });
    const target = new URL(redirect.mock.calls[0][0], "https://example.test");
    expect(target.pathname).toBe("/finance/payments");
    expect(target.searchParams.get("tab")).toBe("UNPAID");
    expect(target.searchParams.get("q")).toBe("문서 & 검색");
    expect(target.searchParams.getAll("from")).toEqual(["one", "two"]);
  });
});