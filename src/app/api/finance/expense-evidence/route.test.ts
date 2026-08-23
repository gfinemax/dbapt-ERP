import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadExpenseEvidenceAction = vi.hoisted(() => vi.fn());

vi.mock("@/app/finance/expense-resolutions/actions", () => ({ uploadExpenseEvidenceAction }));

import { POST } from "./route";

describe("expense evidence upload route", () => {
  beforeEach(() => uploadExpenseEvidenceAction.mockReset());

  it("passes multipart evidence to the existing upload service", async () => {
    uploadExpenseEvidenceAction.mockResolvedValue({ attachment: { id: "evidence-1" }, ok: true });
    const body = new FormData();
    body.set("file", new File(["receipt"], "영수증.png", { type: "image/png" }));
    body.set("resolutionNo", "지결-2026-0001");
    const response = await POST(new Request("https://dbapt-erp.vercel.app/api/finance/expense-evidence", {
      body,
      headers: { host: "dbapt-erp.vercel.app", origin: "https://dbapt-erp.vercel.app" },
      method: "POST",
    }));

    expect(response.status).toBe(201);
    expect(uploadExpenseEvidenceAction).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ ok: true, attachment: { id: "evidence-1" } });
  });

  it("rejects cross-origin upload requests", async () => {
    const response = await POST(new Request("https://dbapt-erp.vercel.app/api/finance/expense-evidence", {
      headers: { host: "dbapt-erp.vercel.app", origin: "https://example.com" },
      method: "POST",
    }));

    expect(response.status).toBe(403);
    expect(uploadExpenseEvidenceAction).not.toHaveBeenCalled();
  });
});
