import { describe, expect, it } from "vitest";
import {
  accountSubjectRecommendations,
  buildAccountSubjectFromRecommendation,
  getAccountSubjectSummary,
  getSelectableAccountSubjectRecommendations,
  registeredAccountSubjects,
} from "./account-subject-data";

describe("account subject data", () => {
  it("keeps operating budget and feasibility analysis recommendations separated by source", () => {
    expect(accountSubjectRecommendations.map((item) => item.source)).toContain("운영비 예산안");
    expect(accountSubjectRecommendations.map((item) => item.source)).toContain("수지분석표");
    expect(accountSubjectRecommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ businessCategory: "운영비", name: "임대료", source: "운영비 예산안" }),
        expect.objectContaining({ businessCategory: "토지비", name: "토지매입비", source: "수지분석표" }),
        expect.objectContaining({ businessCategory: "금융비용", name: "PF이자", source: "수지분석표" }),
      ]),
    );
  });

  it("filters recommendations that are already registered by account name", () => {
    const selectable = getSelectableAccountSubjectRecommendations([
      ...registeredAccountSubjects,
      buildAccountSubjectFromRecommendation(accountSubjectRecommendations.find((item) => item.name === "임대료")!),
    ]);

    expect(selectable.map((item) => item.name)).not.toContain("임대료");
    expect(selectable.map((item) => item.name)).toContain("상여금");
  });

  it("summarizes active account subjects by income, expense, and integration-ready sources", () => {
    expect(getAccountSubjectSummary(registeredAccountSubjects)).toEqual({
      activeSubjects: 6,
      expenseSubjects: 5,
      incomeSubjects: 1,
      valueOnReadySubjects: 3,
    });
  });
});
