import { describe, expect, it } from "vitest";

import { budgetProfilePeriodKey, resolveBudgetProfile } from "./budget-profile-lookup";

describe("resolveBudgetProfile", () => {
  it("connects a detailed operating-expense label to the official budget item", () => {
    const profiles = {
      복리후생비: { amount: 0 },
      [budgetProfilePeriodKey("복리후생비", "2026-01")]: { amount: 650_000 },
    };

    expect(resolveBudgetProfile("운영비 > 복리후생비(식대)", "2026-01", profiles)).toEqual({ amount: 650_000 });
  });

  it("uses the requested month instead of the current-month profile", () => {
    const profiles = {
      복리후생비: { amount: 700_000 },
      [budgetProfilePeriodKey("복리후생비", "2026-01")]: { amount: 650_000 },
    };

    expect(resolveBudgetProfile("복리후생비", "2026-01", profiles)).toEqual({ amount: 650_000 });
  });
});
