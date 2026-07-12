import { describe, expect, it } from "vitest";
import PaymentCompletedRoute from "./page";

describe("payment completed route", () => {
  it("renders the completed payment workflow page component", async () => {
    expect(await PaymentCompletedRoute()).toMatchObject({
      props: { initialMode: "completed" },
      type: expect.any(Function),
    });
  });
});
