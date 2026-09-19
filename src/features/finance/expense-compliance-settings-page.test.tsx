import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseComplianceSettingsPage } from "./expense-compliance-settings-page";

describe("ExpenseComplianceSettingsPage", () => {
  it("routes small-expense settings to the active workflow and persists current controls", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    render(<ExpenseComplianceSettingsPage organizationId="org-1" saveSettings={saveSettings} />);
    expect(screen.getByText(/신규 소액지출은 지출관리의 소액지출 화면에서 등록/)).toBeInTheDocument();
    expect(screen.queryByLabelText("소액경비 기준금액")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("직접 지출 가능 한도"), { target: { value: "4000000" } });
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledWith("org-1", expect.objectContaining({ directExpenseLimit: 4000000 })));
  });
});
