import { describe, expect, it } from "vitest";
import ExpenseResolutionsRoute from "./page";

describe("expense resolutions route", () => {
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
});
