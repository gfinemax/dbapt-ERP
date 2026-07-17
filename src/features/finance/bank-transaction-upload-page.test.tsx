import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BankTransactionUploadPage } from "./bank-transaction-upload-page";

const testBankAccounts = [
  {
    accountName: "국민은행 신탁계좌",
    accountNo: "123456-78-901234",
    accountType: "신탁계좌" as const,
    bankName: "KB국민은행",
    createdAt: "2026-06-01",
    id: "bank-001",
    lastSyncedAt: "2026-06-06 08:10",
    status: "정상" as const,
    unmatchedCount: 5,
    usageStatus: "사용" as const,
  },
  {
    accountName: "국민은행 운영계좌",
    accountNo: "987654-32-100000",
    accountType: "운영계좌" as const,
    bankName: "KB국민은행",
    createdAt: "2026-06-02",
    id: "bank-002",
    lastSyncedAt: "2026-06-06 08:08",
    status: "정상" as const,
    unmatchedCount: 3,
    usageStatus: "사용" as const,
  },
];

describe("BankTransactionUploadPage", () => {
  it("previews pasted bank transactions and prioritizes uploaded 항 and 목 for account matching", async () => {
    render(<BankTransactionUploadPage initialBankAccounts={testBankAccounts} />);

    expect(screen.getByRole("heading", { name: "은행 거래내역 업로드" })).toBeInTheDocument();
    expect(screen.getByLabelText("업로드 대상 계좌")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("거래내역 표 붙여넣기"), {
      target: {
        value:
          "항\t목\t거래일자\t거래시간\t거래종류\t적요\t입금\t출금\t잔액\t취급점\n운영비\t세무비\t2026/07/04\t10:31\t지급\t한빛세무회계\t\t3,300,000\t12,000,000\t우리은행\n분양제비용\tM/H 설치비\t2026/07/05\t11:00\t지급\t모델하우스 설치\t\t900,000\t11,100,000\t신한은행",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "미리보기 생성" }));

    expect(await screen.findByText("세무비")).toBeInTheDocument();
    expect(screen.getByText("업로드분류")).toBeInTheDocument();
    expect(screen.getByText("M/H 설치비")).toBeInTheDocument();
    expect(screen.getByText("신규후보")).toBeInTheDocument();
    expect(screen.getAllByText("국민은행 운영계좌").length).toBeGreaterThan(0);
  });

  it("allows xlsx files from the file picker", () => {
    render(<BankTransactionUploadPage initialBankAccounts={testBankAccounts} />);

    expect(screen.getByLabelText("CSV/TSV/엑셀 파일 선택")).toHaveAttribute("accept", ".csv,.tsv,.txt,.xlsx,.xls");
  });

  it("links bank transaction upload from the finance bank-card detail menu", () => {
    render(<BankTransactionUploadPage />);

    const detailMenu = screen.getByRole("navigation", { name: "회계/자금 상세 메뉴" });
    expect(within(detailMenu).getByRole("link", { name: "은행 거래내역" })).toHaveAttribute("href", "/finance/bank-transactions");
  });

  it("sends preview rows to the save action without creating vouchers", async () => {
    const createBankTransactions = vi.fn().mockResolvedValue([{ id: "bank-transaction-1" }]);
    render(<BankTransactionUploadPage createBankTransactions={createBankTransactions} initialBankAccounts={testBankAccounts} />);

    fireEvent.change(screen.getByLabelText("거래내역 표 붙여넣기"), {
      target: {
        value: "항\t목\t거래일자\t거래시간\t거래종류\t적요\t입금\t출금\t잔액\t거래점\n운영비\t세무비\t2026/07/04\t10:31\t지급\t한빛세무회계\t\t3,300,000\t12,000,000\t우리은행",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "미리보기 생성" }));
    fireEvent.click(screen.getByRole("button", { name: "거래내역 저장" }));

    expect(createBankTransactions).toHaveBeenCalledWith([
      expect.objectContaining({
        bankAccountId: "bank-002",
        matchStatus: "업로드분류",
        recommendedAccountSubjectName: "세무비",
        uploadedAccountTitle: "세무비",
        uploadedMajorCategory: "운영비",
      }),
    ]);
    expect(await screen.findByText("1건 저장 준비가 완료되었습니다. 전표 생성은 다음 단계에서 별도로 처리합니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1번 출금거래 사후결의 초안 작성" })).toHaveAttribute("href", "/finance/exp?bankTransactionId=bank-transaction-1");
  });
});
