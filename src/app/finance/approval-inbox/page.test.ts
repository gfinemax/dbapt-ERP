import { describe, expect, it } from "vitest";
import ApprovalInboxRoute from "./page";

describe("approval inbox route", () => {
  it("renders the approval inbox page component", () => {
    expect(ApprovalInboxRoute()).toMatchObject({
      type: expect.any(Function),
    });
  });
});
