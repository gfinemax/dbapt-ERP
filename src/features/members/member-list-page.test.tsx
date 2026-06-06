import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberListPage } from "./member-list-page";

describe("MemberListPage", () => {
  it("renders the member list workflow", () => {
    render(<MemberListPage />);

    expect(screen.getByRole("heading", { name: "조합원관리" })).toBeInTheDocument();
    expect(screen.getByText("M-000124")).toBeInTheDocument();
    expect(screen.getAllByText("미납")).toHaveLength(2);
    expect(screen.getByText("엑셀 내보내기")).toBeInTheDocument();
  });
});
