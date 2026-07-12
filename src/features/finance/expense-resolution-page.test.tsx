import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpenseEvidenceAttachment } from "./expense-evidence";
import { ExpenseResolutionPage, formatApprovalDateTime } from "./expense-resolution-page";

describe("ExpenseResolutionPage", () => {
  it("formats approval dates with month, day, and time", () => {
    expect(formatApprovalDateTime("2026-07-11")).toBe("07.11 00:00");
    expect(formatApprovalDateTime("2026-07-11 14:35")).toBe("07.11 14:35");
  });
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T09:00:00+09:00"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders an empty list and does not show the obsolete static creation guide", () => {
    render(<ExpenseResolutionPage />);

    expect(screen.getByRole("heading", { name: "지출결의서 관리" })).toBeInTheDocument();
    expect(screen.getByText("등록된 지출결의서가 없습니다. 상단의 지출결의 작성 버튼으로 첫 결의서를 등록해주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 0" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "작성 양식" })).not.toBeInTheDocument();
    expect(screen.queryByText(/지결-2026-000[1-5]/)).not.toBeInTheDocument();
  });

  it("keeps the page available when the remote data source is unavailable", () => {
    render(<ExpenseResolutionPage dataLoadError="지출결의 저장소에 연결하지 못했습니다." initialResolutions={[]} />);

    expect(screen.getByRole("alert")).toHaveTextContent("지출결의 저장소에 연결하지 못했습니다.");
    expect(screen.getByRole("heading", { name: "지출결의서 관리" })).toBeInTheDocument();
  });

  it("opens the real creation modal and saves the first draft", () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    expect(within(dialog).getByLabelText("결의서번호")).toHaveValue("지결-2026-0001");
    expect(within(dialog).getByLabelText("작성자")).toHaveValue("오학동 사무장");

    fireEvent.click(within(dialog).getByRole("button", { name: "임시저장" }));
    expect(screen.getByRole("button", { name: "전체 1" })).toBeInTheDocument();
    expect(screen.getByText("지결-2026-0001")).toBeInTheDocument();
  });

  it("restores locally saved resolutions when the remote store is unavailable", () => {
    const firstRender = render(<ExpenseResolutionPage initialResolutions={[]} />);
    act(() => vi.runOnlyPendingTimers());
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "지출결의서 작성" })).getByRole("button", { name: "임시저장" }));
    expect(localStorage.getItem("dbapt-erp:finance:expense-resolutions")).toContain("지결-2026-0001");
    firstRender.unmount();

    render(<ExpenseResolutionPage initialResolutions={[]} />);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByText("지결-2026-0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 1" })).toBeInTheDocument();
  });

  it("guides the author through payment, evidence, and approval review steps", () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    expect(within(dialog).getByText("지출내역을 어떤 방식으로 작성하시겠습니까?")).toBeInTheDocument();
    expect(within(dialog).getByText("이번 지출은 언제 신청하는 건가요?")).toBeInTheDocument();
    expect(within(dialog).getByText("지출내역을 어떻게 등록하시겠습니까?")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "엑셀 일괄등록" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("navigation", { name: "지출결의 작성 단계" })).toBeInTheDocument();
    expect(within(dialog).getByText("현재 결의 요약")).toBeInTheDocument();
    expect(within(dialog).getByText("지급정보")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByRole("heading", { name: "증빙자료·OCR 결과" })).toBeInTheDocument();
    expect(within(dialog).getByText("이번 달 예산현황")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByText("승인 전 확인")).toBeInTheDocument();
    expect(within(dialog).getByText("결재선")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "승인요청" })).toBeInTheDocument();
  });

  it("shows fields that match the selected expense timing", () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });

    expect(within(dialog).getByLabelText("집행방식")).toHaveValue("VENDOR_DIRECT");
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    expect(within(dialog).getByLabelText("비용부담 유형")).toHaveValue("EMPLOYEE_PREPAID");
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByLabelText("실제 지출일")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /지급·기본정보/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "이전에 받은 금액을 정산합니다" }));
    expect(within(dialog).getByLabelText("원 사전결의")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByLabelText("정산일")).toBeInTheDocument();
  });

  it("calculates multiple single items and validates account allocations", () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));

    fireEvent.change(within(dialog).getByLabelText("품목명 1"), { target: { value: "복사용지" } });
    fireEvent.change(within(dialog).getByLabelText("단가 1"), { target: { value: "10000" } });
    expect(within(dialog).getByLabelText("부가세 1")).toHaveValue(1000);
    expect(within(dialog).getByLabelText("분할금액 1")).toHaveValue(11000);

    fireEvent.click(within(dialog).getByRole("button", { name: "품목 추가" }));
    expect(within(dialog).getByLabelText("품목명 2")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "계정과목 추가" }));
    fireEvent.change(within(dialog).getByLabelText("분할금액 2"), { target: { value: "100" } });
    expect(within(dialog).getByText("계정과목 분할금액 합계를 총지급액과 일치시켜주세요.")).toBeInTheDocument();
  });

  it("opens the existing resolution in edit mode from a print validation warning", () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "지출결의서 작성" })).getByRole("button", { name: "임시저장" }));

    fireEvent.click(screen.getByRole("button", { name: "상세보기" }));
    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(within(detailDialog).getByRole("menuitem", { name: "보관용 PDF 생성" }));

    const warningDialog = screen.getByRole("dialog", { name: "보관용 출력 전 확인" });
    expect(within(warningDialog).getByText(/거래처가 입력되지 않았습니다/)).toBeInTheDocument();
    fireEvent.click(within(warningDialog).getByRole("button", { name: "수정하기" }));

    const editDialog = screen.getByRole("dialog", { name: "지출결의서 수정" });
    expect(within(editDialog).getByLabelText("결의서번호")).toHaveValue("지결-2026-0001");
    fireEvent.change(within(editDialog).getByLabelText("거래처명"), { target: { value: "테스트 거래처" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: "수정사항 저장" }));

    expect(screen.getByRole("button", { name: "전체 1" })).toBeInTheDocument();
    expect(screen.getByText("테스트 거래처")).toBeInTheDocument();
  });

  it("prints project identity and the detailed expense rows for a batch resolution", () => {
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const createDialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(createDialog).getByRole("button", { name: "프로젝트 일괄 지출결의" }));
    expect(within(createDialog).getByRole("button", { name: "엑셀 일괄등록" })).toBeInTheDocument();
    fireEvent.change(within(createDialog).getByLabelText("프로젝트/사업과제"), { target: { value: "사무국 비품 구입" } });
    expect(within(createDialog).getByPlaceholderText("예: 정기총회 준비, 7월 사무실 비품구매")).toHaveValue("사무국 비품 구입");
    fireEvent.click(within(createDialog).getByRole("button", { name: "임시저장" }));

    fireEvent.click(screen.getByRole("button", { name: "상세보기" }));
    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(within(detailDialog).getByRole("menuitem", { name: "A4 출력 미리보기" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "보관용 출력 전 확인" })).getByRole("button", { name: "그래도 출력하기" }));

    const printDialog = screen.getByRole("dialog", { name: "지출결의서 출력 미리보기" });
    expect(within(printDialog).getByText("프로젝트명")).toBeInTheDocument();
    expect(within(printDialog).getAllByText("사무국 비품 구입").length).toBeGreaterThan(0);
    expect(within(printDialog).getByText("건명")).toBeInTheDocument();
    expect(within(printDialog).getByRole("heading", { name: "세부 지출내역" })).toBeInTheDocument();
    expect(within(printDialog).queryByRole("heading", { name: "예산 확인" })).not.toBeInTheDocument();
    expect(within(printDialog).getByRole("heading", { name: "결재선" })).toBeInTheDocument();
    expect(within(printDialog).getByText("총 결의금액")).toBeInTheDocument();
    expect(within(printDialog).getByRole("heading", { name: "증빙 요약" })).toBeInTheDocument();
    expect(within(printDialog).queryByText("사무기기 구입")).not.toBeInTheDocument();
    expect(within(printDialog).queryByText("비품비 > 사무기기")).not.toBeInTheDocument();
    expect(within(printDialog).getByText("사무용품 및 소모품 구입")).toBeInTheDocument();
  });

  it("imports valid Excel-compatible rows and reports invalid rows", async () => {
    vi.useRealTimers();
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "엑셀 가져오기" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    expect(within(dialog).getByRole("button", { name: "엑셀 일괄등록" })).toHaveAttribute("aria-pressed", "true");

    const csv = [
      "지출예정일,거래처,지출항목명,지출구분,계정항목,예산항목,공급가액,부가세,지급방법,증빙유형,메모,예산배정액,기집행액,예산초과사유",
      "2026-07-15,다이스,복사용지,운영비,사무용품비,운영비 > 사무용품,10000,1000,계좌이체,세금계산서,,500000,120000,",
      "2026-02-30,,오류행,운영비,,,금액오류,-1,수표,,,,,",
    ].join("\n");
    const importFile = new File([csv], "지출결의.csv", { type: "text/csv" });
    Object.defineProperty(importFile, "text", { value: async () => csv });
    fireEvent.change(within(dialog).getByLabelText("일괄 지출내역 파일 선택"), {
      target: { files: [importFile] },
    });

    expect(await within(dialog).findByRole("status")).toHaveTextContent("전체 2행 · 반영 1행 · 오류 1행");
    expect(within(dialog).getByLabelText("일괄등록 오류 목록")).toHaveTextContent("3행");
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByLabelText("1행 거래처")).toHaveValue("다이스");
    expect(within(dialog).getByLabelText("1행 공급가액")).toHaveValue(10000);
    expect(within(dialog).getAllByText("11,000원").length).toBeGreaterThan(0);
  });

  it("uploads evidence in step one and automatically applies OCR values to the resolution", async () => {
    vi.useRealTimers();
    const uploadEvidence = vi.fn().mockResolvedValue({
      contentType: "text/plain",
      evidenceType: "세금계산서",
      fileName: "다이스_세금계산서.txt",
      fileSize: 120,
      id: "evidence-1",
      ocrData: { issuer: "다이스", issuerBusinessNumber: "123-45-67890", issuerRepresentative: "김대표", documentDate: "2026-07-15", supplyAmount: 10000, vatAmount: 1000, totalAmount: 11000 },
      ocrStatus: "EXTRACTED",
      storageBucket: "expense-evidence",
      storagePath: "지결-2026-0001/evidence-1.txt",
      uploadedAt: "2026-07-15T09:00:00.000Z",
      uploadedBy: "오학동 사무장",
    });
    render(<ExpenseResolutionPage initialResolutions={[]} uploadEvidence={uploadEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    expect(within(dialog).getByRole("button", { name: "증빙자료 자동입력" })).toHaveAttribute("aria-pressed", "true");

    const file = new File(["공급자: 다이스"], "다이스_세금계산서.txt", { type: "text/plain" });
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [file] } });
    expect(await within(dialog).findByText("다이스_세금계산서.txt")).toBeInTheDocument();
    expect(within(dialog).getByText("OCR 자동입력이 완료되었습니다.")).toBeInTheDocument();
    expect(within(dialog).getByText(/추출값 확인완료/)).toBeInTheDocument();
    expect(within(dialog).getAllByText("10,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: "추출값 반영완료" })).toBeDisabled();
    expect(within(dialog).getByText("금액·증빙").closest("button")).toHaveAttribute("aria-current", "step");
    expect(within(dialog).getByLabelText("거래처명")).toHaveValue("다이스");
    expect(within(dialog).getByLabelText("판매처 상호명")).toHaveValue("다이스");
    expect(within(dialog).getByLabelText("사업자등록번호")).toHaveValue("123-45-67890");
    expect(within(dialog).getByLabelText("대표자명")).toHaveValue("김대표");
    expect(within(dialog).getByLabelText("단가 1")).toHaveValue(10000);
    expect(within(dialog).getByLabelText("실제 지출일")).toHaveValue("2026-07-15");
  });

  it("uses an OCR total as the single expense amount when a receipt has no supply amount", async () => {
    vi.useRealTimers();
    const uploadEvidence = vi.fn().mockResolvedValue({
      contentType: "image/png",
      evidenceType: "영수증",
      fileName: "카드영수증.png",
      fileSize: 120,
      id: "evidence-total-only",
      ocrData: { issuer: "문구점", documentDate: "2026-07-16", totalAmount: 33000 },
      ocrStatus: "EXTRACTED",
      storageBucket: "expense-evidence",
      storagePath: "지결-2026-0001/evidence-total-only.png",
      uploadedAt: "2026-07-16T09:00:00.000Z",
      uploadedBy: "오학동 사무장",
    });
    render(<ExpenseResolutionPage initialResolutions={[]} uploadEvidence={uploadEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "증빙자료 자동입력" }));
    const file = new File(["합계 33,000원"], "카드영수증.png", { type: "image/png" });
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [file] } });

    expect(await within(dialog).findByText("카드영수증.png")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("단가 1")).toHaveValue(33000);
    expect(within(dialog).getByLabelText("부가세 1")).toHaveValue(0);
  });

  it("selects evidence OCR automatically for settlement expenses", () => {
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이전에 받은 금액을 정산합니다" }));

    expect(within(dialog).getByRole("button", { name: "증빙자료 자동입력" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows upload and OCR progress while a PDF is being processed", async () => {
    vi.useRealTimers();
    let finishUpload!: (attachment: ExpenseEvidenceAttachment) => void;
    const uploadEvidence = vi.fn(() => new Promise<ExpenseEvidenceAttachment>((resolve) => { finishUpload = resolve; }));
    render(<ExpenseResolutionPage initialResolutions={[]} uploadEvidence={uploadEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    const file = new File(["pdf"], "카드영수증.pdf", { type: "application/pdf" });
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [file] } });

    expect(await within(dialog).findByRole("status")).toHaveTextContent("1/5 카드영수증.pdf 증빙파일을 업로드하고 있습니다");
    expect(within(dialog).getByRole("status")).toHaveTextContent("백그라운드에서 영수증 분석을 계속합니다");
    await act(async () => finishUpload({
      contentType: "application/pdf",
      evidenceType: "영수증",
      fileName: "카드영수증.pdf",
      fileSize: 3,
      id: "evidence-progress",
      ocrData: {},
      ocrStatus: "REVIEW_REQUIRED",
      storageBucket: "expense-evidence",
      storagePath: "지결-2026-0001/evidence-progress.pdf",
      uploadedAt: "2026-07-16T09:00:00.000Z",
      uploadedBy: "오학동 사무장",
    }));
  });

  it("shows an upload failure above the form instead of hiding it in the evidence section", async () => {
    vi.useRealTimers();
    const uploadEvidence = vi.fn().mockRejectedValue(new Error("PDF 업로드 요청이 실패했습니다."));
    render(<ExpenseResolutionPage initialResolutions={[]} uploadEvidence={uploadEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    const file = new File(["pdf"], "실패영수증.pdf", { type: "application/pdf" });
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [file] } });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("증빙자료를 처리하지 못했습니다");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("PDF 업로드 요청이 실패했습니다");
    expect(within(dialog).getByRole("button", { name: "다른 파일 선택" })).toBeInTheDocument();
  });

  it("polls a background OCR job and applies the completed OpenAI result", async () => {
    vi.useRealTimers();
    const uploadEvidence = vi.fn().mockResolvedValue({
      contentType: "image/jpeg",
      evidenceType: "영수증",
      fileName: "봉투구매.jpg",
      fileSize: 120,
      id: "evidence-background",
      ocrData: {},
      ocrJobId: "evidence-background",
      ocrStatus: "REVIEW_REQUIRED",
      storageBucket: "expense-evidence",
      storagePath: "expense-resolutions/2026-0002/evidence-background.jpg",
      uploadedAt: "2026-07-12T09:00:00.000Z",
      uploadedBy: "오학동 사무장",
    });
    const getEvidenceOcrJob = vi.fn().mockResolvedValue({
      id: "evidence-background",
      progress: 100,
      resultData: { documentDate: "2026-06-19", issuer: "스마트기획", itemName: "소봉투제작(5백매)", provider: "OPENAI", quantity: 1, supplyAmount: 60000, totalAmount: 60000, vatAmount: 0 },
      stage: "COMPLETED",
      status: "COMPLETED",
    });
    render(<ExpenseResolutionPage getEvidenceOcrJob={getEvidenceOcrJob} initialResolutions={[]} uploadEvidence={uploadEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [new File(["image"], "봉투구매.jpg", { type: "image/jpeg" })] } });

    expect(await within(dialog).findByText("OCR 자동입력이 완료되었습니다.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("거래처명")).toHaveValue("스마트기획");
    expect(within(dialog).getByLabelText("품목명 1")).toHaveValue("소봉투제작(5백매)");
    expect(within(dialog).getByLabelText("단가 1")).toHaveValue(60000);
  });
});
