export type BudgetMappingStatus = "CONFIRMED" | "POLICY_REVIEW";

export type OperatingExpenseDetail = {
  budgetItem: string;
  code: string;
  groupName: string;
  id: string;
  name: string;
  policyNote?: string;
  quickExpenseEligible: boolean;
  status: BudgetMappingStatus;
};

export const operatingExpenseDetailFallback: Omit<OperatingExpenseDetail, "id">[] = [
  { code: "LABOR-CHAIR-SALARY", groupName: "인건비", name: "급여(조합장)", budgetItem: "인건비>급여>조합장", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "LABOR-EXEC-SALARY", groupName: "인건비", name: "급여(상근임원)", budgetItem: "인건비>급여>상근임원", status: "POLICY_REVIEW", quickExpenseEligible: false, policyNote: "예산안의 사무장과 상근임원 역할 구분을 확인해야 해." },
  { code: "LABOR-STAFF-SALARY", groupName: "인건비", name: "급여(직원)", budgetItem: "인건비>급여>직원", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "LABOR-BONUS", groupName: "인건비", name: "상여금", budgetItem: "인건비>상여금", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "LABOR-RETIREMENT", groupName: "인건비", name: "퇴직금·퇴직예치", budgetItem: "인건비>퇴직금", status: "POLICY_REVIEW", quickExpenseEligible: false, policyNote: "퇴직예치금과 실제 퇴직금의 회계 처리 기준을 확인해야 해." },
  { code: "LABOR-STATUTORY", groupName: "인건비", name: "법정부담금(4대보험)", budgetItem: "인건비>기타인건비", status: "POLICY_REVIEW", quickExpenseEligible: false, policyNote: "4대보험과 기타인건비를 같은 예산으로 관리할지 확인해야 해." },
  { code: "WELFARE-MEAL", groupName: "복리후생비", name: "식대·간식비", budgetItem: "복리후생비", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "WELFARE-GATHERING", groupName: "복리후생비", name: "회식비", budgetItem: "복리후생비", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "WELFARE-HEALTH", groupName: "복리후생비", name: "건강검진비", budgetItem: "복리후생비", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "WELFARE-CONDOLENCE", groupName: "복리후생비", name: "경조사비", budgetItem: "복리후생비", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "WELFARE-CLOTHING", groupName: "복리후생비", name: "피복비", budgetItem: "복리후생비", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "WELFARE-OTHER", groupName: "복리후생비", name: "기타 복리후생비", budgetItem: "복리후생비", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "BUSINESS-PROMOTION", groupName: "업무추진비", name: "업무추진비", budgetItem: "업무추진비", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "MEETING-BOARD", groupName: "회의비", name: "이사회·대의원회의비", budgetItem: "회의비>이사회비", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "MEETING-AUDIT", groupName: "회의비", name: "감사비", budgetItem: "회의비>감사비", status: "POLICY_REVIEW", quickExpenseEligible: false, policyNote: "세부항목표에 없는 감사비의 분류를 확인해야 해." },
  { code: "MEETING-OTHER", groupName: "회의비", name: "기타회의비", budgetItem: "회의비>이사회비", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "MEETING-ELECTION", groupName: "회의비", name: "총회·선거관리비", budgetItem: "회의비>이사회비", status: "POLICY_REVIEW", quickExpenseEligible: false, policyNote: "총회·선거관리비의 별도 예산 편성 여부를 확인해야 해." },
  { code: "GENERAL-ASSET", groupName: "일반운영비", name: "비품·자산취득비", budgetItem: "일반운영비>사무등록비", status: "POLICY_REVIEW", quickExpenseEligible: false, policyNote: "사무등록비의 산출근거와 자산취득 범위를 확인해야 해." },
  { code: "GENERAL-RENT", groupName: "일반운영비", name: "임차료·관리비", budgetItem: "일반운영비>지급임차료", status: "CONFIRMED", quickExpenseEligible: false },
  { code: "GENERAL-PRINT", groupName: "일반운영비", name: "인쇄·우편비", budgetItem: "일반운영비>도서인쇄비", status: "CONFIRMED", quickExpenseEligible: true },
  { code: "GENERAL-SUPPLIES", groupName: "일반운영비", name: "사무용품비", budgetItem: "일반운영비>사무용품비", status: "CONFIRMED", quickExpenseEligible: true },
  { code: "GENERAL-CONSUMABLE", groupName: "일반운영비", name: "소모품·전산사용료", budgetItem: "일반운영비>소모품비", status: "CONFIRMED", quickExpenseEligible: true },
  { code: "GENERAL-REPAIR", groupName: "일반운영비", name: "수선·유지비", budgetItem: "일반운영비>수선비", status: "CONFIRMED", quickExpenseEligible: true },
  { code: "PUBLIC-COMM", groupName: "공공요금·수수료", name: "통신비", budgetItem: "제세공과금>통신비", status: "CONFIRMED", quickExpenseEligible: true },
  { code: "PUBLIC-AI", groupName: "공공요금·수수료", name: "통신비(AI 업무보조 구독료)", budgetItem: "제세공과금>통신비", status: "POLICY_REVIEW", quickExpenseEligible: false, policyNote: "AI 구독료를 통신비로 처리할지 별도 확인해야 해." },
  { code: "PUBLIC-TRAVEL", groupName: "공공요금·수수료", name: "여비·교통·주차비", budgetItem: "제세공과금>여비교통비", status: "CONFIRMED", quickExpenseEligible: true },
  { code: "PUBLIC-UTILITY", groupName: "공공요금·수수료", name: "전기·수도·관리비", budgetItem: "제세공과금>수도광열비", status: "CONFIRMED", quickExpenseEligible: true },
  { code: "PUBLIC-FEE", groupName: "공공요금·수수료", name: "송금·증명·전산수수료", budgetItem: "제세공과금>지급수수료", status: "CONFIRMED", quickExpenseEligible: true },
  { code: "OTHER-OPERATING", groupName: "기타운영비", name: "기타운영비", budgetItem: "기타운영비", status: "POLICY_REVIEW", quickExpenseEligible: false, policyNote: "광고비 등 구체적인 사용 목적을 확인한 뒤 처리해야 해." },
  { code: "RESERVE", groupName: "예비비", name: "예비비 사용", budgetItem: "예비비", status: "POLICY_REVIEW", quickExpenseEligible: false, policyNote: "예비비 사용 승인 근거를 확인해야 해." },
];

export function detailsForBudget(details: OperatingExpenseDetail[], budgetItem: string) {
  return details.filter((detail) => detail.budgetItem === budgetItem);
}
