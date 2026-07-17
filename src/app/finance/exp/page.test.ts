import { describe, expect, it } from "vitest";
import ExpenseResolutionsRoute from "./page";

describe("legacy /finance/exp route", () => {
  it("uses the DB-backed expense resolution route", async () => {
    expect(await ExpenseResolutionsRoute({ searchParams: Promise.resolve({}) })).toMatchObject({ type: expect.any(Function) });
  });
});
