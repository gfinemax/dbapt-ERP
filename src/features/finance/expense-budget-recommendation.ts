import type { OperatingExpenseDetail } from "./operating-budget-classification";

export type ExpenseBudgetRecommendation = {
  accountTitle: "인건비" | "사업추진비" | "운영비";
  budgetItem: string;
  confidence: "높음" | "보통";
  detailCode?: string;
  matchedKeyword: string;
  reason: string;
};

type RecommendationRule = {
  accountTitle: ExpenseBudgetRecommendation["accountTitle"];
  budgetItem: string;
  detailCode?: string;
  keywords: string[];
};

const recommendationRules: RecommendationRule[] = [
  { accountTitle: "운영비", budgetItem: "일반운영비>도서인쇄비", detailCode: "GENERAL-PRINT", keywords: ["봉투제작", "봉투인쇄", "인쇄", "인쇄물", "출력", "소식지", "신문", "명함", "책자", "제본", "우편요금", "우편발송", "우편료", "등기우편", "일반우편", "우체국"] },
  { accountTitle: "운영비", budgetItem: "일반운영비>지급임차료", detailCode: "GENERAL-RENT", keywords: ["사무실관리비", "사무실임대", "사무실임차", "임대료", "임차료", "월세"] },
  { accountTitle: "운영비", budgetItem: "일반운영비>사무용품비", detailCode: "GENERAL-SUPPLIES", keywords: ["사무용품", "문구", "스테이플러", "건전지", "클리어파일", "파일철"] },
  { accountTitle: "운영비", budgetItem: "일반운영비>소모품비", detailCode: "GENERAL-CONSUMABLE", keywords: ["생수", "커피", "음료", "물티슈", "타포린백", "복사용지", "토너", "잉크", "소모품", "위생백"] },
  { accountTitle: "운영비", budgetItem: "복리후생비", detailCode: "WELFARE-GATHERING", keywords: ["회식비", "회식"] },
  { accountTitle: "운영비", budgetItem: "복리후생비", detailCode: "WELFARE-HEALTH", keywords: ["건강검진", "건강진단"] },
  { accountTitle: "운영비", budgetItem: "복리후생비", detailCode: "WELFARE-CONDOLENCE", keywords: ["경조사비", "축의금", "조의금"] },
  { accountTitle: "운영비", budgetItem: "복리후생비", detailCode: "WELFARE-CLOTHING", keywords: ["피복비", "근무복", "유니폼"] },
  { accountTitle: "운영비", budgetItem: "복리후생비", detailCode: "WELFARE-MEAL", keywords: ["식비", "식대", "간식", "다과"] },
  { accountTitle: "운영비", budgetItem: "일반운영비>수선비", detailCode: "GENERAL-REPAIR", keywords: ["수리", "수선", "유지보수", "보수공사"] },
  { accountTitle: "운영비", budgetItem: "기타운영비", detailCode: "OTHER-OPERATING", keywords: ["신문광고", "광고비", "현수막", "홍보비", "홍보물"] },
  { accountTitle: "운영비", budgetItem: "제세공과금>수도광열비", detailCode: "PUBLIC-UTILITY", keywords: ["수도요금", "전기요금", "가스요금", "광열비"] },
  { accountTitle: "운영비", budgetItem: "제세공과금>통신비", detailCode: "PUBLIC-COMM", keywords: ["전화요금", "인터넷", "팩스", "통신비"] },
  { accountTitle: "운영비", budgetItem: "제세공과금>여비교통비", detailCode: "PUBLIC-TRAVEL", keywords: ["택시비", "통행료", "교통비", "주유", "주차", "출장"] },
  { accountTitle: "운영비", budgetItem: "제세공과금>지급수수료", detailCode: "PUBLIC-FEE", keywords: ["송금수수료", "발급수수료", "열람수수료", "증명수수료", "전산수수료", "수수료"] },
  { accountTitle: "사업추진비", budgetItem: "회의비>감사비", detailCode: "MEETING-AUDIT", keywords: ["감사수당", "감사비"] },
  { accountTitle: "사업추진비", budgetItem: "회의비>이사회비", detailCode: "MEETING-ELECTION", keywords: ["선거관리", "정기총회", "임시총회", "총회비"] },
  { accountTitle: "사업추진비", budgetItem: "회의비>이사회비", detailCode: "MEETING-BOARD", keywords: ["대의원회의", "이사회비", "이사회", "임원회의", "회의수당"] },
  { accountTitle: "사업추진비", budgetItem: "회의비>이사회비", detailCode: "MEETING-OTHER", keywords: ["기타회의비", "실무회의"] },
  { accountTitle: "사업추진비", budgetItem: "업무추진비", detailCode: "BUSINESS-PROMOTION", keywords: ["업무추진비", "업무추진"] },
  { accountTitle: "인건비", budgetItem: "인건비>급여>조합장", detailCode: "LABOR-CHAIR-SALARY", keywords: ["조합장급여", "조합장월급"] },
  { accountTitle: "인건비", budgetItem: "인건비>급여>상근임원", detailCode: "LABOR-EXEC-SALARY", keywords: ["상근임원급여", "사무장급여"] },
  { accountTitle: "인건비", budgetItem: "인건비>급여>직원", detailCode: "LABOR-STAFF-SALARY", keywords: ["사무직원급여", "직원급여"] },
  { accountTitle: "인건비", budgetItem: "인건비>상여금", detailCode: "LABOR-BONUS", keywords: ["상여금", "성과급"] },
  { accountTitle: "인건비", budgetItem: "인건비>기타인건비", detailCode: "LABOR-STATUTORY", keywords: ["4대보험", "법정부담금", "건강보험", "국민연금", "고용보험", "산재보험"] },
  { accountTitle: "인건비", budgetItem: "인건비>퇴직금", detailCode: "LABOR-RETIREMENT", keywords: ["퇴직예치", "퇴직금"] },
  { accountTitle: "운영비", budgetItem: "일반운영비>사무등록비", detailCode: "GENERAL-ASSET", keywords: ["자산취득", "비품구입", "복사기구입", "컴퓨터구입", "노트북구입"] },
  { accountTitle: "운영비", budgetItem: "제세공과금>통신비", detailCode: "PUBLIC-AI", keywords: ["chatgpt", "챗지피티", "인공지능구독", "ai구독료", "ai업무보조"] },
  { accountTitle: "운영비", budgetItem: "예비비", detailCode: "RESERVE", keywords: ["예비비사용", "예비비집행"] },
];

export function recommendExpenseBudget(input: {
  counterparty?: string;
  evidenceText?: string;
  itemName?: string;
  memo?: string;
  reason?: string;
  subject?: string;
  vendorBusinessCategory?: string;
  vendorBusinessType?: string;
  vendorName?: string;
}): ExpenseBudgetRecommendation | null {
  const primary = normalize(`${input.itemName ?? ""} ${input.reason ?? ""} ${input.subject ?? ""} ${input.memo ?? ""} ${input.evidenceText ?? ""}`);
  const secondary = normalize(`${input.vendorName ?? ""} ${input.counterparty ?? ""} ${input.vendorBusinessType ?? ""} ${input.vendorBusinessCategory ?? ""}`);

  const primaryMatch = findBestMatch(primary);
  if (primaryMatch) return buildRecommendation(primaryMatch.rule, primaryMatch.keyword, "높음", "품목명·지출사유");
  const secondaryMatch = findBestMatch(secondary);
  if (secondaryMatch) return buildRecommendation(secondaryMatch.rule, secondaryMatch.keyword, "보통", "거래처 업태·종목");
  return null;
}

function findBestMatch(text: string) {
  return recommendationRules
    .flatMap((rule) => rule.keywords.map((keyword) => ({ keyword, rule, normalizedKeyword: normalize(keyword) })))
    .filter((candidate) => text.includes(candidate.normalizedKeyword))
    .sort((left, right) => right.normalizedKeyword.length - left.normalizedKeyword.length)[0];
}

export function recommendOperatingExpenseDetail(
  details: OperatingExpenseDetail[],
  input: Parameters<typeof recommendExpenseBudget>[0],
) {
  const recommendation = recommendExpenseBudget(input);
  if (!recommendation) return null;
  const detail = recommendation.detailCode
    ? details.find((item) => item.code === recommendation.detailCode)
    : undefined;
  const sameBudget = details.filter((item) => item.budgetItem === recommendation.budgetItem);
  const resolved = detail ?? (sameBudget.length === 1 ? sameBudget[0] : undefined);
  return resolved ? { detail: resolved, recommendation } : null;
}

function buildRecommendation(rule: RecommendationRule, keyword: string, confidence: ExpenseBudgetRecommendation["confidence"], source: string): ExpenseBudgetRecommendation {
  return {
    accountTitle: rule.accountTitle,
    budgetItem: rule.budgetItem,
    detailCode: rule.detailCode,
    confidence,
    matchedKeyword: keyword,
    reason: `${source}에서 '${keyword}'을 인식했습니다.`,
  };
}

function normalize(value: string) {
  return value.normalize("NFKC").replace(/[^가-힣A-Za-z0-9]/g, "").toLowerCase();
}
