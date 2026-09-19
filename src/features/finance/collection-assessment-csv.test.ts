import { describe, expect, it } from "vitest";
import { parseCollectionAssessmentCsv } from "./collection-assessment-csv";

describe("collection assessment CSV", () => {
  it("parses quoted Korean CSV without using a name as the key", () => {
    const rows = parseCollectionAssessmentCsv('\uFEFF외부 조합원 ID,조합원번호,조합원명,부과코드,납부기한,부과액\r\npeopleon-1,M-1,"홍, 길동",2026-09,2026-09-30,"1,500,000"');
    expect(rows[0]).toMatchObject({ row_number: 2, external_member_id: "peopleon-1", member_name_snapshot: "홍, 길동", assessed_amount: 1500000 });
  });
  it("rejects rows without an authoritative external member ID", () => {
    expect(() => parseCollectionAssessmentCsv("외부 조합원 ID,조합원명,부과코드,부과액\n,홍길동,2026-09,1000")).toThrow("이름으로 자동 연결하지 않아");
  });
  it("rejects malformed dates and non-integer amounts", () => {
    expect(() => parseCollectionAssessmentCsv("외부 조합원 ID,조합원명,부과코드,납부기한,부과액\nid,홍길동,A,2026/09/30,10.5")).toThrow("부과액은");
  });
});
