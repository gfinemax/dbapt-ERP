import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceDetailPage } from "./finance-detail-page";

describe("FinanceDetailPage", () => {
  it("does not render a mock transaction detail", () => {
    render(<FinanceDetailPage transactionId="finance-0411" />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
