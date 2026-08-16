import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApprovalDecisionForm } from "./approval-decision-form";

const decideApprovalAction = vi.fn();

vi.mock("@/app/approval/actions", () => ({
  decideApprovalAction: (...args: unknown[]) => decideApprovalAction(...args),
}));

describe("ApprovalDecisionForm", () => {
  it("keeps the user on the form and shows an inline error when rejection reason is missing", () => {
    render(<ApprovalDecisionForm approverLabel="오학동" documentId="approval-1" />);

    fireEvent.click(screen.getByRole("button", { name: "반려" }));

    expect(screen.getByRole("alert")).toHaveTextContent("반려 사유를 입력해주세요.");
    expect(screen.getByLabelText("의견")).toHaveAttribute("aria-invalid", "true");
    expect(decideApprovalAction).not.toHaveBeenCalled();
  });

  it("allows approval without an optional comment", async () => {
    decideApprovalAction.mockResolvedValueOnce({ success: true });
    render(<ApprovalDecisionForm approverLabel="오학동" documentId="approval-1" />);

    fireEvent.click(screen.getByRole("button", { name: "승인" }));

    await waitFor(() => expect(decideApprovalAction).toHaveBeenCalled());
  });

  it("shows repository failures inside the decision card", async () => {
    decideApprovalAction.mockResolvedValueOnce({ error: "현재 결재자만 처리할 수 있어." });
    render(<ApprovalDecisionForm approverLabel="오학동" documentId="approval-1" />);
    fireEvent.change(screen.getByLabelText("의견"), { target: { value: "내용 보완 필요" } });

    fireEvent.click(screen.getByRole("button", { name: "반려" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("현재 결재자만 처리할 수 있어.");
  });
});
