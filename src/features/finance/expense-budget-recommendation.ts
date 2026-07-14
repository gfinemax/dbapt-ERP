export type ExpenseBudgetRecommendation = {
  accountTitle: "인건비" | "사업추진비" | "운영비";
  budgetItem: string;
  confidence: "높음" | "보통";
  matchedKeyword: string;
  reason: string;
};

type RecommendationRule = {
  accountTitle: ExpenseBudgetRecommendation["accountTitle"];
  budgetItem: string;
  keywords: string[];
};

const recommendationRules: RecommendationRule[] = [
  { accountTitle: "운영비", budgetItem: "운영비 > 도서인쇄비", keywords: ["봉투제작", "봉투인쇄", "인쇄", "인쇄물", "출력", "소식지", "신문", "명함", "책자", "제본"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 임대료", keywords: ["사무실임대", "사무실임차", "임대료", "임차료", "월세"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 사무등록비", keywords: ["복사기", "회선등록", "등록비"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 사무용품비", keywords: ["사무용품", "문구", "생수", "커피", "음료", "물티슈", "타포린백"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 소모품비", keywords: ["복사용지", "토너", "잉크", "소모품", "위생백"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 복리후생비", keywords: ["식비", "식대", "회식", "간식"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 수선비", keywords: ["수리", "수선", "보수공사"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 광고비", keywords: ["광고", "현수막", "홍보"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 수도광열비", keywords: ["수도요금", "전기요금", "가스요금", "광열비"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 통신비", keywords: ["전화요금", "인터넷", "팩스", "통신비"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 여비교통비", keywords: ["교통비", "주유", "주차", "출장"] },
  { accountTitle: "운영비", budgetItem: "운영비 > 지급수수료", keywords: ["송금수수료", "발급수수료", "열람수수료", "수수료"] },
  { accountTitle: "사업추진비", budgetItem: "사업추진비 > 회의비", keywords: ["대의원회의", "임원회의", "회의비", "회의수당"] },
  { accountTitle: "사업추진비", budgetItem: "사업추진비 > 감사비", keywords: ["감사수당", "감사비"] },
  { accountTitle: "사업추진비", budgetItem: "사업추진비 > 업무추진비", keywords: ["경조사", "업무추진"] },
  { accountTitle: "인건비", budgetItem: "인건비 > 보험료", keywords: ["4대보험", "보험료"] },
  { accountTitle: "인건비", budgetItem: "인건비 > 퇴직예치금", keywords: ["퇴직예치", "퇴직금"] },
];

export function recommendExpenseBudget(input: {
  itemName?: string;
  reason?: string;
  vendorBusinessCategory?: string;
  vendorBusinessType?: string;
  vendorName?: string;
}): ExpenseBudgetRecommendation | null {
  const primary = normalize(`${input.itemName ?? ""} ${input.reason ?? ""}`);
  const secondary = normalize(`${input.vendorName ?? ""} ${input.vendorBusinessType ?? ""} ${input.vendorBusinessCategory ?? ""}`);

  for (const rule of recommendationRules) {
    const primaryKeyword = rule.keywords.find((keyword) => primary.includes(normalize(keyword)));
    if (primaryKeyword) return buildRecommendation(rule, primaryKeyword, "높음", "품목명·지출사유");
  }
  for (const rule of recommendationRules) {
    const secondaryKeyword = rule.keywords.find((keyword) => secondary.includes(normalize(keyword)));
    if (secondaryKeyword) return buildRecommendation(rule, secondaryKeyword, "보통", "거래처 업태·종목");
  }
  return null;
}

function buildRecommendation(rule: RecommendationRule, keyword: string, confidence: ExpenseBudgetRecommendation["confidence"], source: string): ExpenseBudgetRecommendation {
  return {
    accountTitle: rule.accountTitle,
    budgetItem: rule.budgetItem,
    confidence,
    matchedKeyword: keyword,
    reason: `${source}에서 '${keyword}'을 인식했습니다.`,
  };
}

function normalize(value: string) {
  return value.normalize("NFKC").replace(/[^가-힣A-Za-z0-9]/g, "").toLowerCase();
}
