import { describe, expect, it } from "vitest";
import PaymentCompletedRoute from "./page";

describe("payment completed route", () => {
  it("renders the completed payment workflow page component", () => {
    expect(PaymentCompletedRoute()).toMatchObject({
      props: { initialMode: "completed" },
      type: expect.any(Function),
    });
  });
});
