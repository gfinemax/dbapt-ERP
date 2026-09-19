export type LegacySmallExpenseLike = {
  approvalSkipReason?: string;
  creationSource?: string;
  expenseKind?: string;
};

export function isLegacySmallExpenseResolution(resolution: LegacySmallExpenseLike | null | undefined) {
  return resolution?.expenseKind === "PETTY_CASH_BATCH"
    || resolution?.creationSource === "SMALL_EXPENSE"
    || resolution?.approvalSkipReason === "소액경비 일괄결의";
}

export function assertLegacySmallExpenseReadOnly(
  incoming: LegacySmallExpenseLike,
  existing?: LegacySmallExpenseLike | null,
) {
  if (isLegacySmallExpenseResolution(existing)) {
    throw new Error("기존 소액 일괄결의는 조회·출력과 후속 처리만 가능하며 내용을 수정할 수 없습니다.");
  }
  if (isLegacySmallExpenseResolution(incoming)) {
    throw new Error("소액지출은 지출관리의 소액지출 화면에서 등록해주세요.");
  }
}
