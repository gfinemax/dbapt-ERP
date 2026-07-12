import { describe, expect, it } from "vitest";
import ApprovalInboxRoute from "./page";

describe("approval inbox route", () => {
  it("renders the approval inbox page component", async () => {
    expect(await ApprovalInboxRoute()).toMatchObject({
      type: expect.any(Function),
    });
  });
});
