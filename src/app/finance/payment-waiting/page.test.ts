import { describe, expect, it } from "vitest";
import PaymentWaitingRoute from "./page";

describe("payment waiting route", () => {
  it("renders the payment waiting workflow page component", async () => {
    expect(await PaymentWaitingRoute()).toMatchObject({
      props: { initialMode: "waiting" },
      type: expect.any(Function),
    });
  });
});
