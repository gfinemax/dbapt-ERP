import { beforeEach, describe, expect, it, vi } from "vitest";
const conversion = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/features/finance/expense-authorization", () => ({ requireExpenseActor: async () => ({ user_id: "user", organization_id: "org", display_name: "담당자", active: true, permissions: ["ADMIN"] }) }));
vi.mock("@/features/finance/quick-expense-conversion-repository", () => ({ loadQuickExpenseConversionDraft: conversion.load }));
import ExpenseResolutionsRoute from "./page";

describe("expense resolutions route", () => {
  beforeEach(() => conversion.load.mockReset());
  it("renders the expense resolution page component", async () => {
    expect(await ExpenseResolutionsRoute()).toMatchObject({
      type: expect.any(Function),
    });
  });
  it("passes supported authoring intent without making it an approval command", async () => {
    const page = await ExpenseResolutionsRoute({ searchParams: Promise.resolve({ start: "reimbursement" }) });
    expect(page.props.initialEntryStart).toBe("reimbursement");
    expect(page.props.initialResolutionId).toBeUndefined();
  });
  it("opens the original ID instead of a second draft when both parameters are present", async () => {
    const page = await ExpenseResolutionsRoute({ searchParams: Promise.resolve({ start: "advance", resolutionId: "er_2026_0001" }) });
    expect(page.props.initialResolutionId).toBe("er_2026_0001");
    expect(page.props.initialEntryStart).toBeUndefined();
  });
  it("loads a quick source into the shared formal authoring screen", async () => {
    const draft = { sourceId: "quick-one", recordStatus: "NEEDS_RESOLUTION", evidenceFiles: [] };
    conversion.load.mockResolvedValue(draft);
    const page = await ExpenseResolutionsRoute({ searchParams: Promise.resolve({ quickExpenseId: "quick-one" }) });
    expect(conversion.load).toHaveBeenCalledWith("quick-one");
    expect(page.props.initialQuickExpense).toBe(draft);
    expect(page.props.initialResolutionId).toBeUndefined();
  });
  it("opens an already linked resolution instead of creating another draft", async () => {
    conversion.load.mockResolvedValue({ sourceId: "quick-one", recordStatus: "CONVERTED", linkedResolutionId: "resolution-one", evidenceFiles: [] });
    const page = await ExpenseResolutionsRoute({ searchParams: Promise.resolve({ quickExpenseId: "quick-one" }) });
    expect(page.props.initialQuickExpense).toBeUndefined();
    expect(page.props.initialResolutionId).toBe("resolution-one");
  });
});
