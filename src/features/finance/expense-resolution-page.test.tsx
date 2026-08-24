import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExpenseEvidenceAttachment } from "./expense-evidence";
import { buildExpenseResolutionPdfFileName, ExpenseResolutionPage, formatApprovalDateTime, getEvidenceUploadErrorMessage, getExpensePrintPersonName } from "./expense-resolution-page";

describe("ExpenseResolutionPage", () => {
  it("turns stale Server Action errors into a refresh instruction", () => {
    expect(getEvidenceUploadErrorMessage(new Error("An error occurred in the Server Components render. A digest property is included.")))
      .toBe("화면이 새 버전으로 업데이트되었습니다. 새로고침한 후 증빙파일을 다시 선택해 주세요.");
  });

  it("formats approval dates with month, day, and time", () => {
    expect(formatApprovalDateTime("2026-07-11")).toBe("07.11 00:00");
    expect(formatApprovalDateTime("2026-07-11 14:35")).toBe("07.11 14:35");
  });

  it("prints staff names without their role suffix", () => {
    expect(getExpensePrintPersonName("오학동 사무장")).toBe("오학동");
    expect(getExpensePrintPersonName("장현제 부장")).toBe("장현제");
    expect(getExpensePrintPersonName("안동연")).toBe("안동연");
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

    const listTable = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(screen.getByRole("heading", { name: "지출결의서 관리" })).toBeInTheDocument();
    expect(screen.getByText("등록된 지출결의서가 없습니다. 상단의 지출결의 작성 버튼으로 첫 결의서를 등록해주세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 0" })).toBeInTheDocument();
    expect(within(listTable).getAllByRole("columnheader")).toHaveLength(6);
    expect(within(listTable).getByRole("columnheader", { name: "진행상태" })).toHaveClass("sticky");
    expect(within(listTable).getByRole("columnheader", { name: "처리" })).toHaveClass("sticky", "right-0");
    expect(within(listTable).queryByRole("columnheader", { name: "예산상태" })).not.toBeInTheDocument();
    expect(within(listTable).queryByRole("columnheader", { name: "증빙" })).not.toBeInTheDocument();
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

  it("lets the author reopen a pending resolution to correct its subject", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const firstRender = render(<ExpenseResolutionPage initialResolutions={[]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const createDialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.change(within(createDialog).getByLabelText("건명 (필수)"), { target: { value: "통신 구입" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: "임시저장" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    const draft = persistResolution.mock.calls[0][0];
    persistResolution.mockClear();
    firstRender.unmount();

    render(<ExpenseResolutionPage initialResolutions={[{ ...draft, approvalStatus: "승인대기", currentApprover: "장현재 담당자" }]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "상세보기" }));
    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "수정 후 재요청" }));

    const editDialog = screen.getByRole("dialog", { name: "지출결의서 수정" });
    expect(within(editDialog).getByLabelText("건명 (필수)")).toHaveValue("통신 구입");
    expect(within(editDialog).getByText(/승인대기 문서는 저장 시 결재 상태를 다시 시작합니다/)).toBeInTheDocument();
    fireEvent.change(within(editDialog).getByLabelText("건명 (필수)"), { target: { value: "우편 발송비" } });
    expect(within(editDialog).getByLabelText("건명 (필수)")).toHaveValue("우편 발송비");
    fireEvent.click(within(editDialog).getByRole("button", { name: "수정사항 저장" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    expect(persistResolution.mock.calls[0][0]).toMatchObject({ approvalStatus: "작성중", subject: "우편 발송비" });
  });

  it("keeps a directly edited payment account when a resolution is saved and reopened", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const firstRender = render(<ExpenseResolutionPage initialResolutions={[]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const createDialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.change(within(createDialog).getByLabelText("지급은행"), { target: { value: "기업은행" } });
    fireEvent.change(within(createDialog).getByLabelText("지급계좌번호"), { target: { value: "222-028736-02-019" } });

    expect(within(createDialog).getByLabelText("지급대상")).toHaveValue("manual");
    expect(within(createDialog).getByText("기업은행 ****2019 · 예금주 오학동")).toBeInTheDocument();
    fireEvent.click(within(createDialog).getByRole("button", { name: "임시저장" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    const savedDraft = persistResolution.mock.calls[0][0];
    expect(savedDraft).toMatchObject({
      accountHolder: "오학동",
      paymentAccountNo: "222-028736-02-019",
      paymentBank: "기업은행",
      paymentTargetId: "manual",
    });
    firstRender.unmount();

    const legacyDraft = { ...savedDraft } as typeof savedDraft & { paymentTargetId?: string };
    delete legacyDraft.paymentTargetId;
    render(<ExpenseResolutionPage initialResolutions={[legacyDraft]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "상세보기" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "지출결의서 상세" })).getByRole("button", { name: "수정" }));

    const editDialog = screen.getByRole("dialog", { name: "지출결의서 수정" });
    expect(within(editDialog).getByLabelText("지급대상")).toHaveValue("manual");
    expect(within(editDialog).getByLabelText("지급은행")).toHaveValue("기업은행");
    expect(within(editDialog).getByLabelText("지급계좌번호")).toHaveValue("222-028736-02-019");
    expect(within(editDialog).getByText("기업은행 ****2019 · 예금주 오학동")).toBeInTheDocument();
  });

  it("shows the vendor in the vendor column instead of the settlement recipient", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const firstRender = render(<ExpenseResolutionPage initialResolutions={[]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "지출결의서 작성" })).getByRole("button", { name: "임시저장" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    const draft = persistResolution.mock.calls[0][0];
    firstRender.unmount();

    render(<ExpenseResolutionPage initialResolutions={[{
      ...draft,
      representativeVendorName: "서울신길동우체국",
      settlementRecipient: "오학동 사무장",
      vendorName: "서울신길동우체국",
    }]} />);

    const listTable = screen.getByRole("table", { name: "지출결의서 목록" });
    const resolutionRow = within(listTable).getByText(draft.resolutionNo).closest("tr");
    expect(resolutionRow).not.toBeNull();
    expect(within(resolutionRow!).getByText("서울신길동우체국")).toBeInTheDocument();
    expect(within(resolutionRow!).queryByText("오학동 사무장")).not.toBeInTheDocument();
  });

  it("shows a pending budget selection instead of a false budget overrun", () => {
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));

    expect(within(dialog).getAllByText("예산항목 선택 필요").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("예산초과")).not.toBeInTheDocument();
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
    expect(within(dialog).queryByRole("heading", { name: "품목/용역 내역" })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByRole("heading", { name: "증빙자료·OCR 결과" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "품목/용역 내역" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "기본정보 수정" })).toBeInTheDocument();
    expect(within(dialog).getByText("이번 달 예산현황")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByText("승인 전 확인")).toBeInTheDocument();
    expect(within(dialog).getByText("결재선")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "승인요청" })).toBeInTheDocument();
  });

  it("opens the evidence file picker immediately when automatic input is selected", () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click");
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "증빙자료 자동입력" }));

    expect(inputClick).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByLabelText("증빙자료 자동입력 파일 선택")).toBeInTheDocument();
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
    expect(within(dialog).getByLabelText("세금구분 1")).toHaveValue("TAXABLE");
    expect(within(dialog).getByLabelText("부가세 1")).toHaveValue(1000);
    expect(within(dialog).getByLabelText("분할금액 1")).toHaveValue(11000);

    fireEvent.change(within(dialog).getByLabelText("세금구분 1"), { target: { value: "NO_VAT" } });
    expect(within(dialog).getByLabelText("부가세 1")).toBeDisabled();
    expect(within(dialog).getByLabelText("부가세 1")).toHaveValue(0);
    expect(within(dialog).getByLabelText("분할금액 1")).toHaveValue(10000);

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
    expect(within(printDialog).getByRole("heading", { name: "지출결의서" })).toHaveClass("text-[35px]");
    expect(within(printDialog).getByRole("heading", { name: "핵심 결의정보" })).toHaveClass("text-[15px]");
    expect(within(printDialog).queryByRole("heading", { name: "결의 및 지출 정보" })).not.toBeInTheDocument();
    expect(within(printDialog).queryByRole("heading", { name: "결의 기본정보" })).not.toBeInTheDocument();
    expect(within(printDialog).queryByRole("heading", { name: "지출 정보" })).not.toBeInTheDocument();
    expect(within(printDialog).getByText("프로젝트명")).toBeInTheDocument();
    expect(within(printDialog).getAllByText("사무국 비품 구입").length).toBeGreaterThan(0);
    expect(within(printDialog).getByText("건명")).toBeInTheDocument();
    const expenseItemsHeading = within(printDialog).getByRole("heading", { name: "세부 지출내역" });
    expect(expenseItemsHeading).toHaveClass("text-[15px]");
    const expenseItemsTable = expenseItemsHeading.closest("section")?.querySelector("table");
    expect(expenseItemsTable).toHaveClass("text-[13px]");
    expect(expenseItemsTable?.parentElement).toHaveClass("border-y");
    expect(expenseItemsTable?.parentElement).not.toHaveClass("border");
    expect(expenseItemsTable?.parentElement).toHaveClass("[border-bottom-style:dashed]", "[border-top-style:dashed]");
    expect(within(expenseItemsTable as HTMLTableElement).getByRole("columnheader", { name: "거래처" })).toHaveClass("text-center");
    expect(within(expenseItemsTable as HTMLTableElement).getByRole("columnheader", { name: "거래처" })).toHaveClass("py-[4.5px]");
    expect(within(expenseItemsTable as HTMLTableElement).getByRole("columnheader", { name: "거래처" })).toHaveClass("[border-bottom-style:dashed]");
    expect(expenseItemsTable?.querySelectorAll("col")).toHaveLength(6);
    expect(expenseItemsTable?.querySelectorAll("col")[1]).toHaveClass("w-1/4");
    expect(expenseItemsTable?.querySelectorAll("col")[2]).toHaveClass("w-1/6");
    expect(expenseItemsTable?.querySelector("tbody tr")).toHaveClass("text-center");
    expect(expenseItemsTable?.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(expenseItemsTable?.querySelectorAll("tbody tr[aria-hidden='true']")).toHaveLength(3);
    expect(expenseItemsTable?.querySelector("tbody tr[aria-hidden='true'] td")).toHaveClass("[border-bottom-style:dashed]");
    expect(expenseItemsTable?.querySelector("thead")).toHaveClass("border-y-2", "border-solid", "border-[var(--color-midnight-ink)]");
    expect(expenseItemsTable?.querySelector("tfoot")).toHaveClass("border-y-2", "border-solid", "border-[var(--color-midnight-ink)]", "text-center");
    expect(within(printDialog).queryByRole("heading", { name: "예산 확인" })).not.toBeInTheDocument();
    const approvalHeading = within(printDialog).getByRole("heading", { name: "결재선" });
    const approvalTable = approvalHeading.closest("section")?.querySelector("table");
    expect(approvalTable).toHaveClass("ml-auto", "w-[219px]", "text-[13px]");
    expect(approvalTable?.querySelectorAll("col")).toHaveLength(4);
    expect(approvalTable?.querySelectorAll("col")[1]).toHaveClass("w-[67px]");
    expect(approvalTable?.querySelectorAll("col")[2]).toHaveClass("w-[67px]");
    expect(approvalTable?.querySelectorAll("col")[3]).toHaveClass("w-[67px]");
    expect(within(approvalTable as HTMLTableElement).getAllByText("서명란")[0].closest("td")).toHaveClass("h-[52px]", "px-0.5", "py-0.5");
    expect(within(approvalTable as HTMLTableElement).getByText("결").parentElement).toHaveStyle({ display: "inline-flex", flexDirection: "column", gap: "10px" });
    expect(within(printDialog).getByText("총 결의금액")).toHaveClass("text-[17px]", "font-bold");
    expect(within(printDialog).getByText("총 결의금액")).not.toHaveClass("text-[var(--color-stone)]");
    expect(within(printDialog).getByRole("heading", { name: "지출사유 및 증빙" })).toBeInTheDocument();
    expect(within(printDialog).getByText("작성자").parentElement).toHaveTextContent("작성자오학동");
    expect(within(printDialog).getByText("작성자")).toHaveClass("text-[13px]");
    expect(within(printDialog).getByText("작성자").parentElement?.lastElementChild).toHaveClass("text-[var(--color-stone)]");
    expect(within(printDialog).getByText("작성자").parentElement?.lastElementChild).toHaveClass("justify-center", "text-center");
    expect(within(printDialog).getByText("작성자").parentElement).not.toHaveTextContent("사무장");
    expect(within(printDialog).queryByRole("heading", { name: "증빙 요약" })).not.toBeInTheDocument();
    expect(within(printDialog).queryByText("작성방식")).not.toBeInTheDocument();
    expect(within(printDialog).queryByText("지출 유형")).not.toBeInTheDocument();
    expect(within(printDialog).queryByText("증빙 상태")).not.toBeInTheDocument();
    expect(within(printDialog).queryByText("세금구분")).not.toBeInTheDocument();
    expect(within(printDialog).queryByText("순번")).not.toBeInTheDocument();
    expect(within(printDialog).getByText("조합원의 소중한 자금을 투명하고 책임 있게 집행합니다.")).toBeInTheDocument();
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
    expect(within(dialog).getByLabelText("증빙 유형")).toHaveValue("E_TAX_INVOICE");
    expect(within(dialog).getByLabelText("증빙 상태")).toHaveValue("QUALIFIED");
    expect(within(dialog).queryByLabelText("증빙 미첨부 사유")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "자동입력 이전으로 되돌리기" }));
    expect(within(dialog).getByLabelText("판매처 상호명")).toHaveValue("");
    expect(within(dialog).getByLabelText("단가 1")).toHaveValue(0);
  });

  it("maps a postal receipt to communications budget for the evidence month", async () => {
    vi.useRealTimers();
    const uploadEvidence = vi.fn().mockResolvedValue({
      contentType: "image/png",
      evidenceType: "영수증",
      fileName: "납입금 확인 2차 안내문 우편발송(260821).png",
      fileSize: 158912,
      id: "postal-evidence",
      ocrData: {
        documentDate: "2026-08-21",
        issuer: "서울신길동우체국",
        itemName: "보통",
        items: [{ itemName: "보통", quantity: 68, totalAmount: 40120, unitPrice: 590 }],
        normalizedEvidenceType: "영수증",
        quantity: 68,
        totalAmount: 40120,
      },
      ocrStatus: "EXTRACTED",
      storageBucket: "expense-evidence",
      storagePath: "expense-resolutions/2026-0001/postal-evidence.png",
      uploadedAt: "2026-08-23T11:00:00.000Z",
      uploadedBy: "오학동 사무국장",
    });
    render(<ExpenseResolutionPage initialResolutions={[]} uploadEvidence={uploadEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));

    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), {
      target: { files: [new File(["postal receipt"], "납입금 확인 2차 안내문 우편발송(260821).png", { type: "image/png" })] },
    });

    expect(await within(dialog).findByText(/추천 예산항목: 운영비 > 통신비/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("분할 예산항목 1")).toHaveValue("운영비 > 통신비");
    expect(within(dialog).getByText("2026-08")).toBeInTheDocument();
    expect(within(dialog).getAllByText("59,880원").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("예산초과")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText("증빙 유형")).toHaveValue("SIMPLE_RECEIPT");
    expect(within(dialog).getByLabelText("증빙 상태")).toHaveValue("GENERAL");
    expect(within(dialog).queryByLabelText("증빙 미첨부 사유")).not.toBeInTheDocument();
  });

  it("uses the multipart upload API when no Server Action uploader is provided", async () => {
    vi.useRealTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      attachment: {
        contentType: "image/png",
        evidenceType: "영수증",
        fileName: "우편영수증.png",
        fileSize: 120,
        id: "evidence-route",
        ocrData: {},
        ocrJobId: "evidence-route",
        ocrStatus: "REVIEW_REQUIRED",
        storageBucket: "expense-evidence",
        storagePath: "expense-resolutions/2026-0001/evidence-route.png",
        uploadedAt: "2026-08-23T11:00:00.000Z",
        uploadedBy: "오학동 사무국장",
      },
      ok: true,
    }), { headers: { "Content-Type": "application/json" }, status: 201 }));
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [new File(["image"], "우편영수증.png", { type: "image/png" })] } });

    expect(await within(dialog).findByText("우편영수증.png")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/finance/expense-evidence", expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
  });
  it("uses the resolution number and subject as the PDF file name", () => {
    expect(buildExpenseResolutionPdfFileName("지결-2026-0001", "사무국 비품 구입")).toBe("지결-2026-0001(사무국 비품 구입).pdf");
    expect(buildExpenseResolutionPdfFileName("지결:2026/0001", "계약서 검토? *최종*")).toBe("지결 2026 0001(계약서 검토 최종).pdf");
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

  it("offers a refresh when an open form uses a stale Server Action", async () => {
    vi.useRealTimers();
    const uploadEvidence = vi.fn().mockRejectedValue(new Error("An error occurred in the Server Components render. A digest property is included."));
    render(<ExpenseResolutionPage initialResolutions={[]} uploadEvidence={uploadEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [new File(["image"], "영수증.png", { type: "image/png" })] } });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("화면이 새 버전으로 업데이트되었습니다");
    expect(within(dialog).getByRole("button", { name: "화면 새로고침" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Server Components render")).not.toBeInTheDocument();
  });

  it("shows the safe message returned by the evidence upload action", async () => {
    vi.useRealTimers();
    const uploadEvidence = vi.fn().mockResolvedValue({
      code: "STORAGE_FAILED",
      message: "증빙파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      ok: false,
    });
    render(<ExpenseResolutionPage initialResolutions={[]} uploadEvidence={uploadEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    const file = new File(["image"], "실패영수증.jpg", { type: "image/jpeg" });
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [file] } });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("증빙파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(within(dialog).getByRole("alert")).not.toHaveTextContent("Server Components render");
  });

  it("moves to the matching field when a missing-field validation message is clicked", () => {
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "승인요청" }));

    const subjectLink = within(dialog).getByRole("button", { name: "건명을 입력해주세요." });
    fireEvent.click(subjectLink);
    act(() => vi.runOnlyPendingTimers());

    expect(within(dialog).getByLabelText("건명 (필수)")).toHaveFocus();
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
    expect(within(dialog).getByLabelText("분할 계정과목 1")).toHaveValue("운영비");
    expect(within(dialog).getByLabelText("분할 예산항목 1")).toHaveValue("운영비 > 도서인쇄비");
    expect(within(dialog).getByText(/추천 예산항목: 운영비 > 도서인쇄비/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("분할 적요 1")).toHaveValue("소봉투제작(5백매)");
    expect(within(dialog).getByLabelText("증빙 유형")).toHaveValue("SIMPLE_RECEIPT");
    expect(within(dialog).getByLabelText("증빙 상태")).toHaveValue("GENERAL");

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    const subjectReviewRow = within(dialog).getByText("건명 입력").closest("div");
    expect(subjectReviewRow).not.toBeNull();
    expect(within(subjectReviewRow!).getByText("추천: 인쇄물 구입")).toBeInTheDocument();
    fireEvent.click(within(subjectReviewRow!).getByRole("button", { name: "추천 적용" }));
    expect(within(dialog).getByText("건명 입력").closest("div")).toHaveClass("bg-[var(--color-sprout)]");
    const projectReviewRow = within(dialog).getByText("프로젝트 선택").closest("div");
    expect(within(projectReviewRow!).getByText("추천: 사무국 비품 구입")).toBeInTheDocument();
    const reasonReviewRow = within(dialog).getByText("지출사유 입력").closest("div");
    expect(within(reasonReviewRow!).getByText(/추천: 조합 운영에 필요한 소봉투제작/)).toBeInTheDocument();
  });
});
