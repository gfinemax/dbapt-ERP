import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTrustRequestPrint, type TrustPrintSnapshot } from "./fund-trust-print";

function snapshot(): TrustPrintSnapshot {
  return {
    requestNo: "신탁-2026-0001", title: "운영비 집행 요청", requestDate: "2026-09-08", revision: 2,
    submittedAt: "2026-09-08T09:30:00+09:00", trustee: "테스트 신탁사", contractName: "자금관리 계약",
    contractReference: "2026년 계약 제4조", managementAccountLabel: "관리계좌 ***1234", receiptReference: "접수-301",
    items: [
      { id: "one", sourceNo: "지결-2026-0001", title: "사무용품", recipient: "거래처 A", accountMasked: "***6789", requestedAmount: 250000 },
      { id: "two", sourceNo: "정산-2026-0010", title: "대납 환급", recipient: "신청자 B", accountMasked: "***4321", requestedAmount: 150000 },
    ],
    files: [{ name: "집행 증빙.pdf", sha256: "ab".repeat(32) }],
  };
}
function parse(value: string) { return new DOMParser().parseFromString(value, "text/html"); }
afterEach(() => vi.useRealTimers());

describe("immutable trust request HTML", () => {
  it("prints supplied metadata, distinct item amounts and their requested total", () => {
    const html = renderTrustRequestPrint(snapshot());
    const doc = parse(html);
    expect(doc.documentElement.lang).toBe("ko");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(doc.querySelector(".status")?.textContent).toBe("제출본");
    for (const expected of ["신탁-2026-0001", "2026-09-08", "2026-09-08T09:30:00+09:00", "테스트 신탁사", "자금관리 계약", "2026년 계약 제4조", "관리계좌 ***1234", "접수-301", "지결-2026-0001", "정산-2026-0010", "250,000원", "150,000원", "400,000원", "집행 증빙.pdf", "ab".repeat(32)]) {
      expect(doc.body.textContent).toContain(expected);
    }
    expect(Array.from(doc.querySelectorAll("dt")).find((field) => field.textContent === "제출 버전")?.nextElementSibling?.textContent).toBe("2");
    expect(doc.querySelector(".totals")?.textContent).toContain("400,000원");
    expect(doc.body.textContent).not.toContain("승인완료");
    expect(doc.body.textContent).not.toContain("지급완료");
  });

  it("escapes HTML metacharacters in every displayed user field, including title and file hash", () => {
    const payload = '</title><script>alert("x")</script><img src=x onerror=alert(1)>&\'"';
    const input = snapshot();
    input.requestNo = payload; input.title = payload; input.requestDate = payload; input.submittedAt = payload;
    input.trustee = payload; input.contractName = payload; input.contractReference = payload;
    input.managementAccountLabel = payload; input.receiptReference = payload;
    input.items = [{ id: payload, sourceNo: payload, title: payload, recipient: payload, accountMasked: payload, requestedAmount: 1 }];
    input.files = [{ name: payload, sha256: payload }];
    const html = renderTrustRequestPrint(input);
    const doc = parse(html);
    expect(doc.querySelectorAll("script,img,iframe,object,embed")).toHaveLength(0);
    expect(doc.querySelectorAll("[onerror],[onclick],[onload]")).toHaveLength(0);
    expect(doc.title).toBe(`${payload} · 신탁 자금집행 요청 내역`);
    expect(doc.querySelector(".request-title")?.textContent).toBe(payload);
    expect(doc.querySelector(".hash")?.textContent).toBe(payload);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;&#39;&quot;");
    expect(html).not.toContain(payload);
  });

  it("stays byte-identical across current times and leaves supplied snapshot unchanged", () => {
    const input = snapshot();
    const before = JSON.stringify(input);
    Object.freeze(input.items[0]); Object.freeze(input.items); Object.freeze(input.files[0]); Object.freeze(input.files); Object.freeze(input);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const first = renderTrustRequestPrint(input);
    vi.setSystemTime(new Date("2031-12-31T23:59:59Z"));
    expect(renderTrustRequestPrint(input)).toBe(first);
    expect(JSON.stringify(input)).toBe(before);
    expect(first).not.toContain("2031");
  });

  it("labels draft preparation and shows missing inputs without fabricating payees or dates", () => {
    const input = snapshot();
    input.revision = 0; input.requestNo = ""; input.requestDate = null; input.submittedAt = " "; input.trustee = "";
    input.contractName = ""; input.contractReference = ""; input.managementAccountLabel = ""; input.receiptReference = "";
    input.items[0] = { ...input.items[0], recipient: "", accountMasked: "" };
    input.files = [];
    const doc = parse(renderTrustRequestPrint(input));
    expect(doc.querySelector(".status")?.textContent).toBe("요청 준비");
    expect(doc.querySelectorAll(".missing").length).toBeGreaterThanOrEqual(10);
    expect(doc.body.textContent).toContain("첨부파일 없음");
    expect(doc.body.textContent).not.toContain("거래처 A");
    expect(doc.body.textContent).not.toContain("2026-09-08");
  });

  it("handles an empty draft and zero requested money explicitly", () => {
    const input: TrustPrintSnapshot = { ...snapshot(), revision: 0, items: [] };
    const doc = parse(renderTrustRequestPrint(input));
    expect(doc.body.textContent).toContain("요청 항목 미입력");
    expect(doc.querySelector(".totals")?.textContent).toContain("0원");
    input.items = [{ ...snapshot().items[0], requestedAmount: 0 }];
    expect(parse(renderTrustRequestPrint(input)).querySelector(".totals")?.textContent).toContain("0원");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 10.5, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe item amount %s", (requestedAmount) => {
    const input = snapshot(); input.items[0].requestedAmount = requestedAmount;
    expect(() => renderTrustRequestPrint(input)).toThrow("원 단위");
  });
  it("rejects overflow in total and invalid version numbers", () => {
    const input = snapshot(); input.items[0].requestedAmount = Number.MAX_SAFE_INTEGER; input.items[1].requestedAmount = 1;
    expect(() => renderTrustRequestPrint(input)).toThrow("원 단위");
    for (const revision of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => renderTrustRequestPrint({ ...snapshot(), revision })).toThrow("제출 버전");
    }
  });

  it("provides A4 print layout and no external resources or scripts", () => {
    const html = renderTrustRequestPrint(snapshot());
    const doc = parse(html);
    expect(doc.querySelector("style")?.textContent).toContain("@page{size:A4 portrait");
    expect(doc.querySelector("style")?.textContent).toContain("@media print");
    expect(doc.querySelectorAll("script,link,[src],[href]")).toHaveLength(0);
    expect(html).not.toMatch(/url\(|@import/i);
    expect(doc.body.textContent).toContain("내부 관리용 요청 내역");
  });
});
