import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpensePaymentWorkflowPage } from "./expense-payment-workflow-page";

describe("ExpensePaymentWorkflowPage", () => {
  it.each([
    ["waiting" as const, "지급대기 목록"],
    ["completed" as const, "지급완료 내역 목록"],
  ])("renders the %s view without sample resolutions", (initialMode, tableName) => {
    render(<ExpensePaymentWorkflowPage initialMode={initialMode} />);

    expect(screen.getByRole("table", { name: tableName })).toBeInTheDocument();
    expect(screen.queryByText(/지결-2026-0[23]/)).not.toBeInTheDocument();
  });
});
