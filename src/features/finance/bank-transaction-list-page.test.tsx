import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { registeredAccountSubjects } from "@/features/basic-info/account-subject-data";
import { activityViewHref, BankTransactionListPage, bankTransactionPageHref } from "./bank-transaction-list-page";

vi.mock("@/app/finance/navigation/actions", () => ({ loadFinanceNavigationBadgesAction: vi.fn().mockResolvedValue({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const bankAccounts = [{
  accountName: "우리은행 운영계좌",
  accountNo: "1000200031006",
  accountType: "운영계좌" as const,
  bankName: "우리은행",
  createdAt: "2026-01-01",
  id: "bank-1",
  lastSyncedAt: "2026-11-06 09:00",
  status: "정상" as const,
  unmatchedCount: 1,
  usageStatus: "사용" as const,
}];

const pageData = {
  page: 2,
  pageSize: 50,
  rows: [{
    amount: 55000,
    balanceAmount: 1200000,
    bankAccountId: "bank-1",
    branchName: "대방동",
    classificationNote: "KT 청구서와 대조 필요",
    classificationStatus: "RECOMMENDED" as const,
    counterparty: "KT",
    description: "인터넷 요금",
    id: "transaction-1",
    recommendedAccountSubjectId: "subject-1",
    recommendedAccountSubjectName: "통신비",
    recommendationReason: "거래 적요 키워드로 추천함",
    memo: "9월 인터넷 요금",
    transactedAt: "2026-09-27T09:00:00+09:00",
    transactionKind: "출금" as const,
    uploadedAccountTitle: "통신비",
    uploadedCategory: "운영비",
  }],
  totalCount: 4277,
  totalPages: 86,
};

const statusCounts = {
  ALL: 4277,
  CONFIRMED: 37,
  DEFERRED: 3,
  EXCLUDED: 2,
  RECOMMENDED: 120,
  UNREVIEWED: 4115,
};

const ledgerSourceSummary = {
  erpTransactionCount: 1302,
  googleSheetSourceCount: 44,
  ledgerSourceCount: 1258,
  ledgerOriginalCount: 1303,
  otherSourceCount: 0,
  zeroAmountSourceCount: 45,
  zeroAmountSources: [{
    description: "예금결산이자",
    issueDetail: "입금과 출금 중 정확히 한 금액만 0보다 커야 합니다.",
    sourceTransactionId: "1303",
    transactionDate: "2022-12-17",
    transactionKind: "예금결산",
    transactionTime: "10:46:59",
  }],
};

const sourceReconciliationSummary = {
  depositImpact: 0,
  issueCount: 1,
  issues: [{
    bankAccountId: "bank-1",
    bankTransactionId: "transaction-1",
    comparedAt: "2026-11-08T10:00:00+09:00",
    depositImpact: 0,
    downstreamLinkLabels: [],
    reason: "ERP에는 있지만 최신 Google 시트(시트1) 반영 배치의 어떤 행에도 연결되지 않았어.",
    sourceDocumentId: "sheet-doc",
    sourceSheet: "시트1",
    sourceSystem: "dbapt-ledger",
    sourceTransactionId: "3344",
    transactedAt: "2021-03-23T09:52:00+09:00",
    withdrawalImpact: 1000000,
  }],
  latestComparedAt: "2026-11-08T10:00:00+09:00",
  withdrawalImpact: 1000000,
};

describe("BankTransactionListPage", () => {
  it("shows only the paged transaction list and links secondary workflows", () => {
    render(<BankTransactionListPage bankAccounts={bankAccounts} filters={{}} pageData={pageData} statusCounts={statusCounts} />);
    const main = screen.getByRole("main");
    expect(screen.getByRole("heading", { level: 1, name: "전체 거래내역" })).toBeInTheDocument();
    expect(screen.getByText("조회 결과")).toHaveTextContent("4,277건");
    expect(screen.getAllByText("51–100건 · 2/86")).toHaveLength(2);
    expect(within(main).getByRole("link", { name: "은행 거래 업로드" })).toHaveAttribute("href", "/finance/bank-transactions/upload");
    expect(screen.getByRole("link", { name: "미매칭 거래 검토" })).toHaveAttribute("href", "/finance/bank-unmatched");
    expect(screen.queryByRole("link", { name: "은행계좌 연동" })).not.toBeInTheDocument();
    expect(within(main).queryByRole("link", { name: "미매칭 확인" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "분류 상태 빠른 필터" })).getByRole("link", { name: /미확인.*4,115/ })).toHaveAttribute("href", "/finance/bank-transactions?status=UNREVIEWED");
    expect(screen.queryByText("기존 Ledger 통장거래 가져오기")).not.toBeInTheDocument();
    expect(screen.queryByText("Ledger 계정과목 매핑 작업대")).not.toBeInTheDocument();
  });

  it("shows the bank name and only the first five account digits in each account option", () => {
    render(<BankTransactionListPage bankAccounts={bankAccounts} filters={{}} pageData={pageData} statusCounts={statusCounts} />);

    expect(screen.getByRole("option", { name: "우리은행 · 우리은행 운영계좌 (10002)" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /1000200031006/ })).not.toBeInTheDocument();
  });

  it("shows external recognitions beside bank rows without opening the bank edit drawer", () => {
    render(<BankTransactionListPage
      activitySummary={{
        bankDepositTotal: 100000000,
        bankTransactionCount: 10,
        bankWithdrawalTotal: 20000000,
        confirmedLossTotal: 30000000,
        externalRecognitionCount: 1,
        externalRecognitionTotal: 30000000,
        trustHeldTotal: 0,
      }}
      bankAccounts={bankAccounts}
      filters={{ originType: "EXTERNAL_RECOGNITION" }}
      pageData={{
        page: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1,
        rows: [{
          amount: 30000000,
          balanceAmount: null,
          bankAccountId: "",
          branchName: "",
          cashImpact: "NON_CASH_RECOGNITION",
          classificationStatus: "CONFIRMED",
          counterparty: "고진오",
          description: "동일건설 정액 필증 3천만원",
          id: "external:recognition-1",
          accountingTreatment: "confirmed_loss",
          actualFundAmount: 0,
          lossAmount: 30000000,
          memo: "필증 인정",
          originType: "EXTERNAL_RECOGNITION",
          recognitionStatus: "ACTIVE",
          recommendedAccountSubjectId: null,
          recommendedAccountSubjectName: null,
          recommendationReason: null,
          sourceRecordId: "recognition-1",
          transactedAt: "2009-07-13T00:00:00+09:00",
          transactionKind: null,
        }],
      }}
      statusCounts={{ ...statusCounts, ALL: 1, CONFIRMED: 1 }}
    />);

    expect(screen.getByRole("region", { name: "통합 거래 요약" })).toHaveTextContent("외부납입 인정30,000,000원1건 · 통장 입금 아님");
    expect(within(screen.getByRole("navigation", { name: "거래내역 구분" })).getByRole("link", { name: /외부납입 인정/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByText("외부납입 인정 · 확정결손")).toHaveLength(2);
    expect(screen.getAllByText("비현금 인정").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "동일건설 정액 필증 3천만원" })).toHaveAttribute("href", "/finance/collections");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows totals for the full filtered result instead of only the visible page", () => {
    render(<BankTransactionListPage
      bankAccounts={bankAccounts}
      filteredSummary={{
        bankDepositTotal: 87000000,
        bankWithdrawalTotal: 5000000,
        externalRecognitionCount: 1,
        externalRecognitionTotal: 30000000,
        resultCount: 20,
      }}
      filters={{ query: "송동환" }}
      pageData={{ ...pageData, page: 1, totalCount: 20, totalPages: 1 }}
      statusCounts={{ ...statusCounts, ALL: 20 }}
    />);

    const totals = screen.getByRole("region", { name: "검색 결과 금액 합계" });
    expect(totals).toHaveTextContent("조회 거래 총액122,000,000원입금·출금·비현금 인정의 절대금액 합계");
    expect(totals).toHaveTextContent("입금 합계87,000,000원실제 조합계좌 입금");
    expect(totals).toHaveTextContent("출금 합계5,000,000원실제 조합계좌 출금");
    expect(totals).toHaveTextContent("외부납입 인정 합계30,000,000원1건 · 통장 입금 아님");
    expect(totals).toHaveTextContent("순현금 증감+82,000,000원입금 − 출금");
  });

  it("preserves search, account, date and status filters across pagination", () => {
    expect(bankTransactionPageHref(3, {
      bankAccountId: "bank-1",
      classificationStatus: "UNREVIEWED",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      query: "인터넷",
      originType: "BANK_TRANSACTION",
    })).toBe(
      "/finance/bank-transactions?page=3&q=%EC%9D%B8%ED%84%B0%EB%84%B7&accountId=bank-1&from=2026-09-01&to=2026-09-30&origin=BANK_TRANSACTION&status=UNREVIEWED",
    );
  });

  it("switches between integrated, bank, external and review views without duplicating pages", () => {
    render(<BankTransactionListPage bankAccounts={bankAccounts} filters={{ query: "송동환" }} pageData={pageData} statusCounts={statusCounts} />);

    const views = screen.getByRole("navigation", { name: "거래내역 구분" });
    expect(within(views).getByRole("link", { name: /전체 거래내역/ })).toHaveAttribute("aria-current", "page");
    expect(within(views).getByRole("link", { name: /은행 거래내역/ })).toHaveAttribute("href", "/finance/bank-transactions?q=%EC%86%A1%EB%8F%99%ED%99%98&origin=BANK_TRANSACTION");
    expect(within(views).getByRole("link", { name: /외부납입 인정/ })).toHaveAttribute("href", "/finance/bank-transactions?q=%EC%86%A1%EB%8F%99%ED%99%98&origin=EXTERNAL_RECOGNITION");
    expect(within(views).getByRole("link", { name: /검토 필요/ })).toHaveAttribute("href", "/finance/bank-transactions?q=%EC%86%A1%EB%8F%99%ED%99%98&view=review");
    expect(screen.queryByRole("combobox", { name: "원본 구분" })).not.toBeInTheDocument();
  });

  it("keeps only shared filters when changing primary views", () => {
    const filters = { bankAccountId: "bank-1", classificationStatus: "CONFIRMED" as const, dateFrom: "2026-01-01", query: "KT", sourceReconciliationStatus: "SOURCE_REVIEW_REQUIRED" as const };
    expect(activityViewHref("all", filters)).toBe("/finance/bank-transactions?q=KT&from=2026-01-01");
    expect(activityViewHref("bank", filters)).toBe("/finance/bank-transactions?q=KT&accountId=bank-1&from=2026-01-01&origin=BANK_TRANSACTION");
    expect(activityViewHref("external", filters)).toBe("/finance/bank-transactions?q=KT&from=2026-01-01&origin=EXTERNAL_RECOGNITION");
    expect(activityViewHref("review", filters)).toBe("/finance/bank-transactions?q=KT&from=2026-01-01&view=review");
  });

  it("uses a compact seven-column table with a combined transaction detail column", () => {
    render(<BankTransactionListPage bankAccounts={bankAccounts} filters={{}} pageData={pageData} statusCounts={statusCounts} />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(7);
    expect(screen.getAllByRole("columnheader").every((header) => header.classList.contains("text-center"))).toBe(true);
    expect(screen.getByRole("columnheader", { name: "거래내역" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "금액" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "입금" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "출금" })).not.toBeInTheDocument();
    expect(screen.getByText("−55,000원")).toBeInTheDocument();
    expect(screen.getByText("우리은행 · 1006")).toBeInTheDocument();
    const transactionRow = screen.getByText("−55,000원").closest("tr");
    expect(transactionRow).not.toBeNull();
    const transactionCells = within(transactionRow!).getAllByRole("cell");
    expect(transactionCells.every((cell) => cell.classList.contains("text-center"))).toBe(true);
    expect(transactionCells[3]).toHaveTextContent("항목구분 · 운영비");
    expect(transactionCells[3]).toHaveTextContent("업로드 계정항목 · 통신비");
    expect(transactionCells[3]).toHaveTextContent("메모·비고 · 9월 인터넷 요금");
    expect(transactionCells[3]).toHaveTextContent("취급점 · 대방동");
    expect(transactionCells[3]).toHaveTextContent("관리자 비고 · KT 청구서와 대조 필요");
    expect(within(transactionRow!).getByRole("link", { name: "인터넷 요금 거래내역·관리자 비고 수정" })).toHaveAttribute("href", "/finance/bank-transactions?page=2&transactionId=transaction-1");
    expect(screen.getByText("2026-09-27 09:00").closest("td")).toHaveClass("px-2", "py-2.5", "text-center");
    expect(document.querySelector("table")).toHaveClass("min-w-[1040px]", "table-fixed");
    expect([...document.querySelectorAll("colgroup col")].map((column) => column.className)).toEqual([
      "w-[12%]",
      "w-[13%]",
      "w-[18%]",
      "w-[25%]",
      "w-[11%]",
      "w-[14%]",
      "w-[7%]",
    ]);
  });

  it("shows active filters as removable chips", () => {
    render(<BankTransactionListPage
      bankAccounts={bankAccounts}
      filters={{ bankAccountId: "bank-1", classificationStatus: "RECOMMENDED", dateFrom: "2026-09-01", query: "KT" }}
      pageData={pageData}
      statusCounts={statusCounts}
    />);

    expect(screen.getByRole("link", { name: "검색: KT 필터 제거" })).toHaveAttribute("href", "/finance/bank-transactions?accountId=bank-1&from=2026-09-01&status=RECOMMENDED");
    expect(screen.getByRole("link", { name: "우리은행 · 우리은행 운영계좌 (10002) 필터 제거" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "추천 있음 필터 제거" })).toHaveAttribute("href", "/finance/bank-transactions?q=KT&accountId=bank-1&from=2026-09-01");
  });

  it("separates zero-amount Ledger source rows from ERP accounting transactions", () => {
    render(<BankTransactionListPage
      bankAccounts={bankAccounts}
      filters={{ bankAccountId: "bank-1" }}
      ledgerSourceSummary={ledgerSourceSummary}
      pageData={pageData}
      statusCounts={statusCounts}
    />);

    const sourceAudit = screen.getByRole("region", { name: "ERP 거래 원본 구성" });
    expect(within(sourceAudit).getByText("전체 ERP 거래").parentElement).toHaveTextContent("1,302건");
    expect(within(sourceAudit).getByText("Ledger 원본 연계").parentElement).toHaveTextContent("1,258건Ledger 원본 1,303건");
    expect(within(sourceAudit).getByText("Google 시트 신규").parentElement).toHaveTextContent("44건ERP에 새로 등록");
    expect(within(sourceAudit).getByText("기타 원본").parentElement).toHaveTextContent("0건");
    expect(within(sourceAudit).getByText("금액 없는 Ledger 원본").parentElement).toHaveTextContent("45건회계 집계 제외");
    expect(within(sourceAudit).getByText("금액 없는 Ledger 원본 45건 보기")).toBeInTheDocument();
    expect(within(sourceAudit).getByText("1303")).toBeInTheDocument();
    expect(within(sourceAudit).getByText("2022-12-17 10:46:59")).toBeInTheDocument();
    expect(within(sourceAudit).getByText("예금결산이자")).toBeInTheDocument();
  });

  it("shows source reconciliation separately from account classification and links to the single issue", () => {
    const reconciliationPage = {
      ...pageData,
      rows: [{ ...pageData.rows[0], description: "", sourceReconciliationIssue: sourceReconciliationSummary.issues[0] }],
    };
    render(<BankTransactionListPage
      bankAccounts={bankAccounts}
      filters={{}}
      pageData={reconciliationPage}
      selectedTransactionId="transaction-1"
      sourceReconciliationSummary={sourceReconciliationSummary}
      statusCounts={statusCounts}
    />);

    const alert = screen.getByRole("region", { name: "원본 대조 알림" });
    expect(within(alert).getByText("원본 확인 필요 1건")).toBeInTheDocument();
    expect(within(alert).getByText(/출금 1,000,000원/)).toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: "1건 바로 보기" })).toHaveAttribute("href", "/finance/bank-transactions?sourceReview=required");
    expect(screen.getByRole("link", { name: "적요 없음" })).toBeInTheDocument();
    const drawer = screen.getByRole("dialog", { name: "적요 없음" });
    expect(within(drawer).getByRole("region", { name: "원본 대조 상태" })).toHaveTextContent("ERP 원본 ID3344");
    expect(within(drawer).getByText("연결 없음")).toBeInTheDocument();
  });

  it("uses uploaded fields as references and saves the ERP subject with an admin note", async () => {
    const saveReviewAction = vi.fn().mockResolvedValue({
      account_subject_id: registeredAccountSubjects[0].id,
      classification_note: "통신비 청구서 확인 완료",
      classification_status: "CONFIRMED",
      transaction_id: "transaction-1",
    });
    render(<BankTransactionListPage
      accountSubjects={registeredAccountSubjects}
      bankAccounts={bankAccounts}
      filters={{}}
      pageData={pageData}
      rulePreview={{
        activeRuleAccountSubjectId: null,
        activeRuleAccountSubjectName: null,
        activeRuleId: null,
        direction: "WITHDRAWAL",
        matchText: "인터넷 요금",
        pendingAmount: 165000,
        pendingCount: 3,
      }}
      saveReviewAction={saveReviewAction}
      selectedTransactionId="transaction-1"
      statusCounts={statusCounts}
    />);

    const drawer = screen.getByRole("dialog", { name: "인터넷 요금" });
    const references = within(drawer).getByRole("region", { name: "업로드 참고 정보" });
    expect(references).toHaveTextContent("항목구분운영비");
    expect(references).toHaveTextContent("업로드 계정항목통신비");
    expect(references).toHaveTextContent("업로드 메모9월 인터넷 요금");
    expect(within(drawer).getByLabelText("관리자 비고")).toHaveValue("KT 청구서와 대조 필요");
    expect(within(drawer).getByText("현재 미확인·추천 3건 · 합계 165,000원")).toBeInTheDocument();
    expect(within(drawer).getByRole("radio", { name: /같은 거래 모두 \+ 앞으로 자동분류/ })).toBeChecked();

    fireEvent.change(within(drawer).getByLabelText("ERP 계정과목"), { target: { value: registeredAccountSubjects[0].id } });
    fireEvent.change(within(drawer).getByLabelText("관리자 비고"), { target: { value: "통신비 청구서 확인 완료" } });
    fireEvent.click(within(drawer).getByRole("button", { name: "선택 범위 저장·확정" }));

    expect(saveReviewAction).toHaveBeenCalledWith({
      accountSubjectId: registeredAccountSubjects[0].id,
      action: "CONFIRM",
      adminNote: "통신비 청구서 확인 완료",
      ruleScope: "MATCHING_AND_FUTURE",
      transactionId: "transaction-1",
    });
    expect(await within(drawer).findByText("계정과목과 관리자 비고를 확정했어.")).toBeInTheDocument();
  });

  it("edits the combined transaction-detail column without changing source references", async () => {
    const saveDetailOverridesAction = vi.fn().mockResolvedValue({
      changed_count: 3,
      transaction_id: "transaction-1",
      values: {
        BRANCH_NAME: "본점",
        MEMO: "10월 통신비",
        UPLOADED_ACCOUNT_TITLE: "통신비",
        UPLOADED_CATEGORY: "운영비-통신",
      },
    });
    render(<BankTransactionListPage
      bankAccounts={bankAccounts}
      filters={{}}
      pageData={pageData}
      saveDetailOverridesAction={saveDetailOverridesAction}
      selectedTransactionId="transaction-1"
      statusCounts={statusCounts}
    />);

    const drawer = screen.getByRole("dialog", { name: "인터넷 요금" });
    const source = within(drawer).getByRole("region", { name: "업로드 참고 정보" });
    expect(source).toHaveTextContent("항목구분운영비");
    expect(source).toHaveTextContent("업로드 메모9월 인터넷 요금");
    const editor = within(drawer).getByRole("region", { name: "ERP 거래내역 편집" });
    expect(within(editor).getByRole("button", { name: "거래내역 저장" })).toBeDisabled();

    fireEvent.change(within(editor).getByLabelText("항목구분 표시값"), { target: { value: "운영비-통신" } });
    fireEvent.change(within(editor).getByLabelText("취급점 표시값"), { target: { value: "본점" } });
    fireEvent.change(within(editor).getByLabelText("메모·비고 표시값"), { target: { value: "10월 통신비" } });
    fireEvent.change(within(editor).getByLabelText("거래내역 수정 사유"), { target: { value: "통장 원문 대조" } });
    fireEvent.click(within(editor).getByRole("button", { name: "거래내역 저장" }));

    expect(saveDetailOverridesAction).toHaveBeenCalledWith({
      fields: {
        BRANCH_NAME: "본점",
        MEMO: "10월 통신비",
        UPLOADED_ACCOUNT_TITLE: "통신비",
        UPLOADED_CATEGORY: "운영비-통신",
      },
      reason: "통장 원문 대조",
      transactionId: "transaction-1",
    });
    expect(await within(editor).findByText("거래내역 3개 항목을 수정했어.")).toBeInTheDocument();
    expect(source).toHaveTextContent("항목구분운영비");
  });

  it("shows the ERP business category with the account subject while keeping source metadata separate", () => {
    const mealSubject = {
      ...registeredAccountSubjects[3],
      businessCategory: "운영비" as const,
      id: "meal-subject",
      name: "복리후생비(식대)",
    };
    render(<BankTransactionListPage
      accountSubjects={[...registeredAccountSubjects, mealSubject]}
      bankAccounts={bankAccounts}
      filters={{}}
      pageData={{
        ...pageData,
        rows: [{
          ...pageData.rows[0],
          classificationStatus: "CONFIRMED" as const,
          confirmedAccountSubjectId: mealSubject.id,
          confirmedAccountSubjectName: mealSubject.name,
          uploadedCategory: "지출-운영비",
        }],
      }}
      statusCounts={statusCounts}
    />);

    expect(screen.getByText("운영비 · 복리후생비(식대)")).toBeInTheDocument();
    expect(screen.getByText("지출-운영비").closest("div")).toHaveTextContent("항목구분 · 지출-운영비");
  });

  it("lets an administrator choose ordered Excel or PDF export columns for the current result", () => {
    render(<BankTransactionListPage bankAccounts={bankAccounts} canExport filters={{ query: "인터넷" }} pageData={pageData} statusCounts={statusCounts} />);

    fireEvent.click(screen.getByRole("button", { name: "검색 결과 내보내기" }));
    const dialog = screen.getByRole("dialog", { name: "검색 결과 내보내기" });
    expect(within(dialog).getByText("현재 검색 조건의 4,277건을 선택한 컬럼 순서로 내려받아.")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("checkbox", { checked: true })).toHaveLength(7);
    expect(within(dialog).getByText("거래일 → 일시 → 계좌 → 적요 → 거래내역 → 금액 → 계정과목")).toBeInTheDocument();
    expect(within(dialog).getByText("관리자 비고").parentElement).toHaveTextContent("내부정보");
    fireEvent.click(within(dialog).getByRole("radio", { name: "PDF" }));
    expect(within(dialog).getByText(/PDF는 1,000건까지 지원해/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "PDF 내려받기" })).toBeDisabled();
  });
});
