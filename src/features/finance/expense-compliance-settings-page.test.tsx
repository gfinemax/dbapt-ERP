import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseComplianceSettingsPage } from "./expense-compliance-settings-page";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

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

  it("loads recommended policy values and saves a versioned draft without applying it", async () => {
    const savePolicyDraft = vi.fn().mockResolvedValue(undefined);
    render(<ExpenseComplianceSettingsPage organizationId="org-1" savePolicyDraft={savePolicyDraft} />);
    fireEvent.click(screen.getByRole("button", { name: "추천값 불러오기" }));
    expect(screen.getByText(/권장 초기값을 불러왔어/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("정상 접수 기한"), { target: { value: "31" } });
    fireEvent.change(screen.getByPlaceholderText("예: 운영규정 의결안 반영"), { target: { value: "테스트 운영기준" } });
    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));
    await vi.waitFor(() => expect(savePolicyDraft).toHaveBeenCalledWith(expect.objectContaining({
      changeReason: "테스트 운영기준",
      organizationId: "org-1",
      policy: expect.objectContaining({ normalDays: 31, simpleApprovalMax: 500000 }),
    })));
    expect(await screen.findByText("정책 초안을 저장했어.")).toBeInTheDocument();
  });
});
