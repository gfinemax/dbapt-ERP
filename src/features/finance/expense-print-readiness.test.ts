import { afterEach, describe, expect, it } from "vitest";
import { waitForExpensePrintLayout } from "./expense-resolution-page";

describe("expense print readiness", () => {
  afterEach(() => {
    document.head.querySelectorAll("[data-print-readiness-test]").forEach((node) => node.remove());
    document.body.querySelectorAll("[data-print-readiness-test]").forEach((node) => node.remove());
  });

  it("continues only after the print grid style is applied", async () => {
    const style = document.createElement("style");
    style.dataset.printReadinessTest = "true";
    style.textContent = ".expense-resolution-print-header { display: grid; }";
    document.head.appendChild(style);
    const header = document.createElement("header");
    header.dataset.printReadinessTest = "true";
    header.className = "expense-resolution-print-header";
    document.body.appendChild(header);

    await expect(waitForExpensePrintLayout(document, window, 100)).resolves.toBeUndefined();
  });

  it("blocks printing when the expected print layout is not applied", async () => {
    const header = document.createElement("header");
    header.dataset.printReadinessTest = "true";
    header.className = "expense-resolution-print-header";
    document.body.appendChild(header);

    await expect(waitForExpensePrintLayout(document, window, 100)).rejects.toThrow("출력 스타일이 적용되지 않았습니다");
  });
});
