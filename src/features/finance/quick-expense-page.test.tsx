import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickExpensePage } from "./quick-expense-page";

const details = [{ id: "detail-communications", code: "PUBLIC-COMM", groupName: "공공요금·수수료", name: "통신비", budgetItem: "제세공과금>통신비", status: "CONFIRMED" as const, quickExpenseEligible: true }];

describe("QuickExpensePage", () => {
  it("shows payment methods in the requested priority order", () => {
    render(<QuickExpensePage initialBankTransactions={[]} initialCardTransactions={[]} initialRecords={[]} />);
    const fieldset = screen.getByText("결제수단").closest("fieldset");
    expect(fieldset).not.toBeNull();
    expect(within(fieldset!).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "법인카드", "개인 선결제", "현금", "계좌이체", "자동이체",
    ]);
  });

  it("saves usage against a bank transaction without creating an expense resolution", async () => {
    const persistRecord = vi.fn(async (input) => ({ ...input, createdAt: "2026-08-27T12:00:00+09:00", directExpenseDecision: "ALLOWED" as const, directExpenseReasons: ["승인 예산 범위 내 일상·정기 지출로 직접 처리할 수 있습니다."], id: "quick-1", recordStatus: "RECORDED" as const }));
    render(<QuickExpensePage initialBankTransactions={[{ counterparty: "KT", description: "인터넷", id: "bank-1", resolutionStatus: "UNRESOLVED", transactedAt: "2026-08-27T09:00:00+09:00", withdrawalAmount: 55000 }]} initialCardTransactions={[]} initialExpenseDetails={details} initialRecords={[]} persistRecord={persistRecord} />);

    fireEvent.change(screen.getByLabelText("미처리 통장 출금거래"), { target: { value: "bank-1" } });
    fireEvent.change(screen.getByLabelText("사용내용"), { target: { value: "조합 사무실 인터넷 요금" } });
    expect(screen.getByLabelText("지출 세부항목")).toHaveValue("detail-communications");
    expect(screen.getByText(/사용내용·거래처에서 자동 선택/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "사용내용 등록" }));

    await waitFor(() => expect(persistRecord).toHaveBeenCalledWith(expect.objectContaining({ bankTransactionId: "bank-1", budgetItem: "제세공과금>통신비", expenseDetailId: "detail-communications", sourceType: "BANK_TRANSACTION", usageDescription: "조합 사무실 인터넷 요금" })));
    expect(await screen.findByText("지출결의 없이 사용내용을 등록했어.")).toBeInTheDocument();
    expect(screen.getByText("간편처리 완료")).toBeInTheDocument();
  });

  it("supports manual cash usage records", () => {
    render(<QuickExpensePage initialBankTransactions={[]} initialCardTransactions={[]} initialRecords={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "현금" }));
    expect(screen.getByLabelText("금액")).toBeInTheDocument();
    expect(screen.getByLabelText("거래처·지급대상")).toBeInTheDocument();
  });

  it("opens the receipt picker from the primary receipt button", () => {
    render(<QuickExpensePage initialBankTransactions={[]} initialCardTransactions={[]} initialRecords={[]} />);
    const input = screen.getByLabelText("증빙 파일");
    const click = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "영수증 선택 · OCR 자동입력" }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("uploads and attaches a selected receipt after saving the quick expense", async () => {
    const persistRecord = vi.fn(async (input) => ({ ...input, createdAt: "2026-08-27T12:00:00+09:00", directExpenseDecision: "ALLOWED" as const, directExpenseReasons: ["증빙 확인 필요"], id: "quick-1", recordStatus: "EVIDENCE_PENDING" as const }));
    const attachment = { contentType: "image/jpeg", evidenceType: "영수증", fileName: "receipt.jpg", fileSize: 1234, id: "evidence-1", ocrData: {}, ocrJobId: "ocr-1", ocrStatus: "REVIEW_REQUIRED" as const, storageBucket: "expense-evidence", storagePath: "org/receipt.jpg", uploadedAt: "2026-08-27T12:00:00+09:00", uploadedBy: "user-1" };
    const uploadEvidence = vi.fn(async () => ({ attachment, ok: true as const }));
    const attachEvidence = vi.fn(async () => undefined);
    render(<QuickExpensePage attachEvidence={attachEvidence} initialBankTransactions={[{ counterparty: "KT", description: "인터넷", id: "bank-1", resolutionStatus: "UNRESOLVED", transactedAt: "2026-08-27T09:00:00+09:00", withdrawalAmount: 55000 }]} initialCardTransactions={[]} initialExpenseDetails={details} initialRecords={[]} persistRecord={persistRecord} uploadEvidence={uploadEvidence} />);

    fireEvent.change(screen.getByLabelText("미처리 통장 출금거래"), { target: { value: "bank-1" } });
    fireEvent.change(screen.getByLabelText("사용내용"), { target: { value: "조합 사무실 인터넷 요금" } });
    const file = new File(["receipt"], "receipt.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("증빙 파일"), { target: { files: [file] } });
    await waitFor(() => expect(uploadEvidence).toHaveBeenCalledWith(file, expect.stringMatching(/^QUICK-DRAFT-/), "영수증"));
    fireEvent.click(screen.getByRole("button", { name: "사용내용 등록" }));

    await waitFor(() => expect(attachEvidence).toHaveBeenCalledWith("quick-1", attachment, "quick-receipt:quick-1:ocr-1"));
    expect(await screen.findByText(/사용내용과 영수증을 등록했어/)).toBeInTheDocument();
  });

  it("keeps the saved record and explains how to retry when receipt upload fails", async () => {
    const persistRecord = vi.fn(async (input) => ({ ...input, createdAt: "2026-08-27T12:00:00+09:00", directExpenseDecision: "ALLOWED" as const, directExpenseReasons: ["증빙 확인 필요"], id: "quick-1", recordStatus: "EVIDENCE_PENDING" as const }));
    const uploadEvidence = vi.fn(async () => ({ code: "STORAGE_FAILED" as const, message: "저장소 오류", ok: false as const }));
    render(<QuickExpensePage attachEvidence={vi.fn()} initialBankTransactions={[{ counterparty: "KT", description: "인터넷", id: "bank-1", resolutionStatus: "UNRESOLVED", transactedAt: "2026-08-27T09:00:00+09:00", withdrawalAmount: 55000 }]} initialCardTransactions={[]} initialExpenseDetails={details} initialRecords={[]} persistRecord={persistRecord} uploadEvidence={uploadEvidence} />);

    fireEvent.change(screen.getByLabelText("미처리 통장 출금거래"), { target: { value: "bank-1" } });
    fireEvent.change(screen.getByLabelText("사용내용"), { target: { value: "조합 사무실 인터넷 요금" } });
    fireEvent.change(screen.getByLabelText("증빙 파일"), { target: { files: [new File(["receipt"], "receipt.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByText(/자동입력 실패 · 저장소 오류/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "사용내용 등록" }));

    expect(await screen.findByText(/사용내용은 등록했지만 영수증 자동입력은 완료하지 못했어/)).toBeInTheDocument();
    expect(screen.getByText("조합 사무실 인터넷 요금")).toBeInTheDocument();
    expect(persistRecord).toHaveBeenCalledTimes(1);
  });

  it("fills manual card fields from OCR without overwriting later user edits", async () => {
    const attachment = { contentType: "image/jpeg", evidenceType: "영수증", fileName: "receipt.jpg", fileSize: 1234, id: "evidence-1", ocrData: {}, ocrJobId: "ocr-1", ocrStatus: "REVIEW_REQUIRED" as const, storageBucket: "expense-evidence", storagePath: "org/receipt.jpg", uploadedAt: "2026-09-18T12:00:00+09:00", uploadedBy: "user-1" };
    const uploadEvidence = vi.fn(async () => ({ attachment, ok: true as const }));
    const getEvidenceOcrJob = vi.fn(async () => ({ id: "ocr-1", progress: 100, resultData: { documentDate: "2026-09-17", issuer: "문구상사", itemName: "복사용지", totalAmount: 32000 }, stage: "COMPLETED" as const, status: "COMPLETED" as const }));
    render(<QuickExpensePage getEvidenceOcrJob={getEvidenceOcrJob} initialBankTransactions={[]} initialCardTransactions={[]} initialExpenseDetails={details} initialRecords={[]} uploadEvidence={uploadEvidence} />);

    fireEvent.click(screen.getByRole("button", { name: "법인카드" }));
    fireEvent.change(screen.getByLabelText("증빙 파일"), { target: { files: [new File(["receipt"], "receipt.jpg", { type: "image/jpeg" })] } });

    await waitFor(() => expect(screen.getByLabelText(/카드 사용금액/)).toHaveValue("32,000"), { timeout: 2500 });
    expect(screen.getByLabelText(/카드 사용일/)).toHaveValue("2026-09-17");
    expect(screen.getByLabelText(/가맹점·사용처/)).toHaveValue("문구상사");
    expect(screen.getByRole("textbox", { name: /^사용내용/ })).toHaveValue("복사용지");
    fireEvent.change(screen.getByLabelText(/가맹점·사용처/), { target: { value: "사용자 수정 상호" } });
    expect(screen.getByLabelText(/가맹점·사용처/)).toHaveValue("사용자 수정 상호");
  });

  it("retries a failed receipt OCR job without uploading the receipt again", async () => {
    const attachment = { contentType: "application/pdf", evidenceType: "영수증", fileName: "receipt.pdf", fileSize: 1234, id: "evidence-1", ocrData: {}, ocrJobId: "ocr-1", ocrStatus: "REVIEW_REQUIRED" as const, storageBucket: "expense-evidence", storagePath: "org/receipt.pdf", uploadedAt: "2026-09-18T12:00:00+09:00", uploadedBy: "user-1" };
    const uploadEvidence = vi.fn(async () => ({ attachment, ok: true as const }));
    const retryEvidenceOcrJob = vi.fn(async () => undefined);
    const getEvidenceOcrJob = vi.fn()
      .mockResolvedValueOnce({ errorMessage: "OpenAI 분석 실패 (503/server_error)", id: "ocr-1", progress: 100, resultData: {}, stage: "FAILED" as const, status: "FAILED" as const })
      .mockResolvedValue({ id: "ocr-1", progress: 100, resultData: { documentDate: "2026-09-18", issuer: "주식회사공단유통", itemName: "커피", totalAmount: 32600 }, stage: "COMPLETED" as const, status: "COMPLETED" as const });
    render(<QuickExpensePage getEvidenceOcrJob={getEvidenceOcrJob} initialBankTransactions={[]} initialCardTransactions={[]} initialExpenseDetails={details} initialRecords={[]} retryEvidenceOcrJob={retryEvidenceOcrJob} uploadEvidence={uploadEvidence} />);

    fireEvent.click(screen.getByRole("button", { name: "법인카드" }));
    fireEvent.change(screen.getByLabelText("증빙 파일"), { target: { files: [new File(["receipt"], "receipt.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByRole("button", { name: "OCR 다시 분석" }, { timeout: 2500 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "OCR 다시 분석" }));

    await waitFor(() => expect(retryEvidenceOcrJob).toHaveBeenCalledWith("ocr-1"));
    await waitFor(() => expect(screen.getByLabelText(/카드 사용금액/)).toHaveValue("32,600"), { timeout: 2500 });
    expect(uploadEvidence).toHaveBeenCalledTimes(1);
  });

  it("shows a clear empty-card state and temporarily records usage without an approval transaction", async () => {
    const persistRecord = vi.fn(async (input) => ({ ...input, createdAt: "2026-08-27T12:00:00+09:00", directExpenseDecision: "ALLOWED" as const, directExpenseReasons: ["카드내역 연결 필요"], id: "quick-card-1", recordStatus: "SOURCE_PENDING" as const }));
    render(<QuickExpensePage initialBankTransactions={[]} initialCardTransactions={[]} initialExpenseDetails={details} initialRecords={[]} persistRecord={persistRecord} />);

    fireEvent.click(screen.getByRole("button", { name: "법인카드" }));
    expect(screen.getByText("등록된 미처리 법인카드 승인내역이 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "사용내용 임시등록" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("카드 사용금액"), { target: { value: "48000" } });
    fireEvent.change(screen.getByLabelText("가맹점·사용처"), { target: { value: "교보문고" } });
    fireEvent.change(screen.getByLabelText("사용내용"), { target: { value: "총회 참고도서 구매" } });
    fireEvent.change(screen.getByLabelText("지출 세부항목"), { target: { value: "detail-communications" } });
    fireEvent.click(screen.getByRole("button", { name: "사용내용 임시등록" }));

    await waitFor(() => expect(persistRecord).toHaveBeenCalledWith(expect.objectContaining({ corporateCardTransactionId: undefined, paymentMethod: "CORPORATE_CARD", sourceType: "MANUAL" })));
    expect(await screen.findByText(/카드 승인내역이 들어오면 실제 거래를 연결해줘/)).toBeInTheDocument();
    expect(screen.getByText("카드내역 연결대기")).toBeInTheDocument();
  });

  it("keeps the registration button visible and explains missing fields", () => {
    render(<QuickExpensePage initialBankTransactions={[]} initialCardTransactions={[]} initialRecords={[]} />);
    expect(screen.getByRole("button", { name: "사용내용 등록" })).toBeEnabled();
    expect(screen.getByText(/입력 필요: 실제 거래, 금액/)).toBeInTheDocument();
  });

  it("links a pending usage record to a matching card transaction", async () => {
    const linkCardTransaction = vi.fn(async () => ({ recordStatus: "RECORDED" as const }));
    render(<QuickExpensePage
      initialBankTransactions={[]}
      initialCardTransactions={[{ amount: 15800, approvedAt: "2026-08-27T12:10:00+09:00", cardLastFour: "5521", cardName: "KB법인", id: "card-1", merchantName: "카카오T" }]}
      initialRecords={[{ amount: 15800, approvalSkipReason: "승인 예산 내 일상 지출", budgetItem: "운영비 > 여비교통비", counterparty: "카카오T", createdAt: "2026-08-27T12:00:00+09:00", directExpenseDecision: "ALLOWED", directExpenseReasons: ["카드내역 연결 필요"], evidenceStatus: "NONE", id: "quick-card-1", occurredAt: "2026-08-27T12:00:00+09:00", paymentMethod: "CORPORATE_CARD", recordedByLabel: "오학동 사무장", recordStatus: "SOURCE_PENDING", sourceType: "MANUAL", usageDescription: "업무협의 후 복귀 택시비" }]}
      linkCardTransaction={linkCardTransaction}
    />);

    fireEvent.click(screen.getByRole("button", { name: "카드내역 연결대기" }));
    fireEvent.click(screen.getByRole("button", { name: /카카오T.*연결/ }));

    await waitFor(() => expect(linkCardTransaction).toHaveBeenCalledWith({ cardTransactionId: "card-1", recordId: "quick-card-1" }));
    expect(await screen.findByText("카드 이용내역을 연결하고 예산 내 간편처리를 완료했어.")).toBeInTheDocument();
    expect(screen.getByText("간편처리 완료")).toBeInTheDocument();
  });
});
