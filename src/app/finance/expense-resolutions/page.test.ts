import { describe, expect, it } from "vitest";
import ExpenseResolutionsRoute from "./page";

describe("expense resolutions route", () => {
  it("renders the expense resolution page component", () => {
    expect(ExpenseResolutionsRoute()).toMatchObject({
      type: expect.any(Function),
    });
  });
});
