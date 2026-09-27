import readXlsxFile from "read-excel-file/node";
import { describe, expect, it } from "vitest";

import { buildTaxAccountantWorkbook } from "./tax-accountant-export";

describe("tax accountant workbook", () => {
  it("exports confirmed journal lines and tax evidence as separate sheets", async () => {
    const workbook = await buildTaxAccountantWorkbook({
      evidence: [{ evidenceType: "전자세금계산서", fileName: "세금계산서.pdf", id: "evidence-1", resolutionId: "resolution-1", resolutionNo: "지결-2026-0001", uploadedAt: "2026-09-03T10:00:00+09:00" }],
      generatedAt: "2026-09-27T12:00:00.000Z",
      month: "2026-09",
      organizationName: "대방동 지역주택조합",
      voucherLines: [{ accountCode: "OPERATING-COMM", accountName: "통신비", approvalStatus: "승인완료", creditAmount: 0, debitAmount: 55000, description: "인터넷 요금", memo: "9월", sortOrder: 1, voucherDate: "2026-09-03", voucherId: "voucher-1", voucherNo: "회계-2026-000001" }],
    });

    const sheets = await readXlsxFile(workbook);
    const vouchers = sheets.find((sheet) => sheet.sheet === "확정 전표")!.data;
    const evidence = sheets.find((sheet) => sheet.sheet === "세금 증빙 목록")!.data;
    const guide = sheets.find((sheet) => sheet.sheet === "안내")!.data;
    expect(vouchers[0]).toEqual(["전표일자", "전표번호", "상태", "계정코드", "계정과목", "적요", "차변", "대변", "메모"]);
    expect(vouchers[1]).toEqual(expect.arrayContaining(["회계-2026-000001", "OPERATING-COMM", "통신비", 55000]));
    expect(evidence[1]).toEqual(expect.arrayContaining(["지결-2026-0001", "전자세금계산서", "세금계산서.pdf", "/finance/evidence/evidence-1/download"]));
    expect(guide.flat()).toContain("이 파일은 세무사 검토용 자료이며 홈택스 신고 전송 또는 세무신고 확정을 대신하지 않습니다.");
  });
});
