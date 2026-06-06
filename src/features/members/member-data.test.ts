import { describe, expect, it } from "vitest";
import { findMemberById, memberFilters, members } from "./member-data";

describe("member data", () => {
  it("keeps representative member rows for the first member list screen", () => {
    expect(members.map((member) => member.memberNo)).toEqual([
      "M-000124",
      "M-000125",
      "M-000126",
    ]);
  });

  it("defines the list status filters in display order", () => {
    expect(memberFilters).toEqual(["전체", "정상", "검토중", "미납", "서류미비", "탈퇴/승계"]);
  });

  it("finds a member detail by id", () => {
    expect(findMemberById("m-000125")?.name).toBe("박서연");
  });
});
