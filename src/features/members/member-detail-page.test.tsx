import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberDetailPage } from "./member-detail-page";

describe("MemberDetailPage", () => {
  it("renders a member detail with core tabs and recent payment context", () => {
    render(<MemberDetailPage memberId="m-000124" />);

    expect(screen.getByRole("heading", { name: "김민준 / M-000124" })).toBeInTheDocument();
    expect(screen.getByText("계약/권리")).toBeInTheDocument();
    expect(screen.getByText("최근 납부")).toBeInTheDocument();
    expect(screen.getByText("계약금")).toBeInTheDocument();
  });
});
