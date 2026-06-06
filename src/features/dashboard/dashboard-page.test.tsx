import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardPage } from "./dashboard-page";

describe("DashboardPage", () => {
  it("renders the ERP shell and first dashboard modules", () => {
    render(<DashboardPage />);

    expect(
      screen.getByRole("heading", { name: "대방동 지역주택조합 ERP" }),
    ).toBeInTheDocument();
    expect(screen.getByText("조합원관리")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "회계/자금" })).toBeInTheDocument();
    expect(screen.getByText("총회관리")).toBeInTheDocument();
    expect(screen.getByText("연동 상태")).toBeInTheDocument();
  });
});
