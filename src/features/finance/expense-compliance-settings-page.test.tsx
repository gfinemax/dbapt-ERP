import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseComplianceSettingsPage } from "./expense-compliance-settings-page";

describe("ExpenseComplianceSettingsPage", () => {
  it("shows the non-exemption notice and persists changed thresholds", async () => {
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    render(<ExpenseComplianceSettingsPage organizationId="org-1" saveSettings={saveSettings} />);
    expect(screen.getByText(/작성 면제 기준이 아니라/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("소액경비 기준금액"), { target: { value: "40000" } });
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalledWith("org-1", expect.objectContaining({ pettyCashLimit: 40000 })));
  });
});
