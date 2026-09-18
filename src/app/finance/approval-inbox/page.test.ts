import { describe, expect, it, vi } from "vitest";
import ApprovalInboxRoute from "./page";
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
describe("approval inbox route", () => {
  it("opens the expense view of the unified inbox", async () => {
    await expect(ApprovalInboxRoute()).rejects.toThrow("/approval/inbox?type=expense");
  });
});
