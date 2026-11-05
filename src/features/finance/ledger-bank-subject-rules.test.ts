import { describe, expect, it } from "vitest";

import type { RegisteredAccountSubject } from "@/features/basic-info/account-subject-data";
import {
  buildLedgerAccountSubjectSyncInputs,
  buildLedgerBankSubjectTransactionPage,
  buildLedgerBankSubjectRuleWorkboard,
  normalizeLedgerDescription,
} from "./ledger-bank-subject-rules";

const subjects: RegisteredAccountSubject[] = [{
  aliases: [], businessCategory: "운영비", code: "OP-350", description: "", id: "subject-supply",
  isActive: true, name: "소모품비", normalBalance: "차변", parentId: null, sortOrder: 1,
  source: "직접등록", subjectType: "지출",
}];

describe("ledger bank subject rules", () => {
  it("normalizes descriptions without changing the source value", () => {
    expect(normalizeLedgerDescription("  카드 수수료\u3000결제 ")).toBe("카드수수료결제");
  });

  it("reduces transactions to category and description rules with exact candidates", () => {
    const workboard = buildLedgerBankSubjectRuleWorkboard([
      { payload: { category_group: "운영비", category_name: "소모품비", deposit_amount: 0, description: "문구", ledger_category_id: "12", withdrawal_amount: 1000 } },
      { payload: { category_group: "운영비", category_name: "소모품비", deposit_amount: 0, description: "토너", ledger_category_id: "12", withdrawal_amount: 2000 } },
      { payload: { category_name: null, deposit_amount: 0, description: " KT 통신 ", ledger_category_id: null, withdrawal_amount: 3000 } },
      { payload: { category_name: "확인필요", deposit_amount: 0, description: "KT통신", ledger_category_id: "99", withdrawal_amount: 4000 } },
      { payload: { category_name: null, deposit_amount: 50, description: "", ledger_category_id: null, withdrawal_amount: 0 } },
    ], [{
      account_subject_id: "subject-supply", direction: "WITHDRAWAL", match_type: "CATEGORY",
      rule_status: "CONFIRMED", source_key: "12",
    }], subjects);

    expect(workboard.transactionCount).toBe(5);
    expect(workboard.blankDescriptionCount).toBe(1);
    expect(workboard.categoryGroups).toEqual([expect.objectContaining({
      amountTotal: 3000,
      candidateAccountSubjectId: "subject-supply",
      ruleAccountSubjectId: "subject-supply",
      transactionCount: 2,
    })]);
    expect(workboard.descriptionGroups).toEqual([expect.objectContaining({
      amountTotal: 7000,
      sourceKey: "kt통신",
      transactionCount: 2,
    })]);
  });

  it("uses the persisted Ledger category link instead of relying on a mutable name", () => {
    const workboard = buildLedgerBankSubjectRuleWorkboard([{
      payload: { category_group: "사업비", category_name: "토지비(구명칭)", deposit_amount: 0, ledger_category_id: "15", withdrawal_amount: 1000 },
    }], [], [{ ...subjects[0], id: "subject-land", name: "토지매입비" }], [{
      account_subject_id: "subject-land",
      direction: "WITHDRAWAL",
      ledger_category_id: "15",
      sync_status: "MATCHED",
    }]);

    expect(workboard.syncedCategoryCount).toBe(1);
    expect(workboard.categoryGroups[0]).toEqual(expect.objectContaining({
      candidateAccountSubjectId: "subject-land",
      candidateAccountSubjectName: "토지매입비",
      syncStatus: "MATCHED",
    }));
    expect(buildLedgerAccountSubjectSyncInputs(workboard)).toEqual([{
      categoryGroup: "사업비",
      categoryName: "토지비(구명칭)",
      direction: "WITHDRAWAL",
      ledgerCategoryId: "15",
    }]);
  });

  it("returns only the clicked category and direction as a read-only transaction page", () => {
    const page = buildLedgerBankSubjectTransactionPage([
      { ledger_account_id: "10", source_transaction_id: "1", payload: { account_name: "운영계좌", category_name: "소모품비", deposit_amount: 0, description: "문구 구입", ledger_category_id: "12", transaction_date: "2026-01-02", withdrawal_amount: 1000 } },
      { ledger_account_id: "10", source_transaction_id: "2", payload: { account_name: "운영계좌", category_name: "소모품비", deposit_amount: 0, description: "토너 구입", ledger_category_id: "12", transaction_date: "2026-01-03", withdrawal_amount: 2000 } },
      { ledger_account_id: "10", source_transaction_id: "3", payload: { category_name: "소모품비", deposit_amount: 3000, description: "입금 제외", ledger_category_id: "12", transaction_date: "2026-01-04", withdrawal_amount: 0 } },
      { ledger_account_id: "10", source_transaction_id: "4", payload: { category_name: "통신비", deposit_amount: 0, description: "다른 분류", ledger_category_id: "29", transaction_date: "2026-01-05", withdrawal_amount: 4000 } },
    ], { direction: "WITHDRAWAL", matchType: "CATEGORY", page: 1, sourceKey: "12" });

    expect(page).toMatchObject({ page: 1, pageSize: 25, totalCount: 2, totalPages: 1 });
    expect(page.rows.map((row) => row.description)).toEqual(["토너 구입", "문구 구입"]);
  });

  it("uses the same normalized description rule when opening unclassified transactions", () => {
    const page = buildLedgerBankSubjectTransactionPage([
      { ledger_account_id: "10", source_transaction_id: "1", payload: { category_name: null, deposit_amount: 0, description: " KT 통신 ", ledger_category_id: null, withdrawal_amount: 1000 } },
      { ledger_account_id: "10", source_transaction_id: "2", payload: { category_name: "확인필요", deposit_amount: 0, description: "KT통신", ledger_category_id: "99", withdrawal_amount: 2000 } },
      { ledger_account_id: "10", source_transaction_id: "3", payload: { category_name: "확인필요", deposit_amount: 0, description: "다른 적요", ledger_category_id: "99", withdrawal_amount: 3000 } },
    ], { direction: "WITHDRAWAL", matchType: "DESCRIPTION", page: 1, sourceKey: "kt통신" });

    expect(page.totalCount).toBe(2);
    expect(page.rows.map((row) => row.description)).toEqual(["KT통신", "KT 통신"]);
  });
});
