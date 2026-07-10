import { describe, expect, it } from "vitest";
import { registeredAccountSubjects } from "@/features/basic-info/account-subject-data";
import {
  detectBankTransactionColumns,
  parseBankTransactionRows,
  recommendAccountSubjectForTransaction,
} from "./bank-transaction-import";

describe("bank transaction import", () => {
  it("detects flexible bank transaction column aliases including 항, 목, and 취급점", () => {
    expect(detectBankTransactionColumns(["항", "목", "거래일자", "거래시간", "거래종류", "적요", "입금", "출금", "잔액", "취급점"])).toEqual({
      balanceAmount: 8,
      branchName: 9,
      depositAmount: 6,
      description: 5,
      transactionDate: 2,
      transactionKind: 4,
      transactionTime: 3,
      uploadedAccountTitle: 1,
      uploadedMajorCategory: 0,
      withdrawalAmount: 7,
    });
  });

  it("uses uploaded 항 and 목 as the first account subject match when the subject exists", () => {
    const rows = parseBankTransactionRows({
      accountSubjects: registeredAccountSubjects,
      headers: ["항", "목", "거래일자", "거래시간", "거래종류", "적요", "입금", "출금", "잔액", "거래점"],
      rows: [["운영비", "세무비", "2026/07/04", "10:31", "지급", "한빛세무회계", "", "3,300,000", "12,000,000", "우리은행"]],
      selectedBankAccountId: "bank-operation",
      selectedBankAccountName: "국민은행 운영계좌",
    });

    expect(rows[0]).toMatchObject({
      bankAccountId: "bank-operation",
      matchStatus: "업로드분류",
      recommendedAccountSubjectName: "세무비",
      transactionKind: "출금",
      uploadedAccountTitle: "세무비",
      uploadedMajorCategory: "운영비",
      withdrawalAmount: 3300000,
    });
  });

  it("marks uploaded 항 and 목 as a new candidate when the subject is not registered", () => {
    const rows = parseBankTransactionRows({
      accountSubjects: registeredAccountSubjects,
      headers: ["항", "목", "거래일자", "적요", "입금", "출금", "잔액"],
      rows: [["분양제비용", "M/H 설치비", "2026/07/05", "모델하우스 설치", "", "900,000", "11,100,000"]],
      selectedBankAccountId: "bank-operation",
      selectedBankAccountName: "국민은행 운영계좌",
    });

    expect(rows[0]).toMatchObject({
      matchStatus: "신규후보",
      uploadedAccountTitle: "M/H 설치비",
      uploadedMajorCategory: "분양제비용",
    });
  });

  it("falls back to keyword recommendations when uploaded 항 and 목 are missing", () => {
    expect(
      recommendAccountSubjectForTransaction({
        accountSubjects: registeredAccountSubjects,
        branchName: "우리은행",
        description: "KT 인터넷 요금",
        transactionKind: "출금",
      }),
    ).toMatchObject({
      matchStatus: "자동추천",
      recommendedAccountSubjectName: "통신비",
    });
  });
});
