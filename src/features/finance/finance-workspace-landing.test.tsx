import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FinanceWorkspaceLanding, parseFinanceWorkspaceKey } from "./finance-workspace-landing";

describe("FinanceWorkspaceLanding", () => {
  it("accepts only supported workspace query values", () => {
    expect(parseFinanceWorkspaceKey("cash")).toBe("cash");
    expect(parseFinanceWorkspaceKey("services")).toBe("services");
    expect(parseFinanceWorkspaceKey("unknown")).toBeUndefined();
    expect(parseFinanceWorkspaceKey(undefined)).toBeUndefined();
  });

  it("renders workspace-specific content instead of the voucher page", () => {
    render(<FinanceWorkspaceLanding workspaceKey="receivables" />);

    expect(screen.getByRole("heading", { level: 1, name: "채권·채무" })).toBeInTheDocument();
    const workflows = screen.getByRole("region", { name: "채권·채무 업무" });
    expect(within(workflows).getByText("거래처 원장")).toBeInTheDocument();
    expect(screen.queryByText("수입·지출 전표관리")).not.toBeInTheDocument();
  });

  it("links implemented budget workflows from the landing page", () => {
    render(<FinanceWorkspaceLanding workspaceKey="budget" />);

    expect(screen.getByRole("link", { name: /예산 대비 집행/ })).toHaveAttribute("href", "/finance/reimbursements?tab=budgets");
    expect(screen.getByRole("link", { name: /월별 결산/ })).toHaveAttribute("href", "/finance/month-close");
  });
});
