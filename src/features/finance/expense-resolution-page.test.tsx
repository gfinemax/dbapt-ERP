import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExpenseApprovalPolicy } from "@/features/approval/approval-effective-policy";
import type { ExpenseEvidenceAttachment } from "./expense-evidence";
import { defaultExpenseComplianceSettings } from "./expense-compliance";
import { expenseResolutionFixture, legacyPendingSecretaryExpenseFixture } from "./expense-resolution-test-fixture";
import { buildExpenseResolutionPdfFileName, createFormState, ExpenseResolutionPage, formatApprovalDateTime, getApprovalTransitionErrorMessage, getDocumentApprovalParticipants, getEvidenceUploadErrorMessage, getExpensePrintEvidenceText, getExpensePrintItemDescription, getExpensePrintPersonName, type BatchExpenseItem } from "./expense-resolution-page";
import { getEditBankTransactionCandidates } from "./expense-resolution-form-options";
import { ExpenseResolutionDetailModal } from "./expense-resolution-detail-modal";
import { ExpenseResolutionCorrectionForm } from "./expense-resolution-correction-form";
import { ExpenseResolutionPrintPreviewModal, paginateExpensePrintRowHeights } from "./expense-resolution-print-preview";
import type { QuickExpenseConversionDraft } from "./quick-expense-conversion-repository";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: navigation.push }) }));

function batchExpenseItem(itemNo: number, totalAmount: number): BatchExpenseItem {
  return {
    accountTitle: "복리후생비(식대)", allocatedBudget: totalAmount, budgetItem: "운영비 > 복리후생비(식대)", budgetStatus: "NORMAL",
    currentRequestAmount: totalAmount, description: "업무식대", actualSpender: "조합 운영계좌", businessPurpose: "사무국 업무 수행",
    evidenceFileName: `${itemNo}.pdf`, evidenceKind: "SIMPLE_RECEIPT", evidenceStatus: "QUALIFIED", evidenceType: "영수증", executedAmount: 0,
    expenseDate: `2026-01-${String(itemNo + 6).padStart(2, "0")}`, expenseType: "운영비", id: `batch-${itemNo}`, itemNo,
    itemTitle: "업무식대", memo: "", overBudgetAmount: 0, overBudgetReason: "", paymentMethod: "계좌이체", paymentStatus: "지급전",
    remainingBudget: 650_000 - totalAmount, supplyAmount: String(totalAmount), totalAmount, vatAmount: "0", vendorName: "옛골식당",
  };
}

async function getExpenseResolutionForm(name: "간편지출을 정식결의로 전환" | "지출결의서 수정" | "지출결의서 작성") {
  await act(async () => {
    await import("./expense-resolution-create-modal");
    if (vi.isFakeTimers()) await vi.runOnlyPendingTimersAsync();
    else await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  return screen.getByRole(name === "지출결의서 수정" ? "region" : "dialog", { name });
}

describe("ExpenseResolutionPage", () => {
  it("fills each A4 expense page by measured row height and reserves the final reason block", () => {
    expect(paginateExpensePrintRowHeights({
      continuationPageBudget: 100,
      finalBlockHeight: 20,
      firstPageBudget: 100,
      rowHeights: Array.from({ length: 12 }, () => 10),
    })).toEqual([10, 2]);
    expect(paginateExpensePrintRowHeights({
      continuationPageBudget: 100,
      finalBlockHeight: 30,
      firstPageBudget: 100,
      rowHeights: [45, 45, 45, 45],
    })).toEqual([2, 1, 1]);
  });

  it("turns stale Server Action errors into a refresh instruction", () => {
    expect(getEvidenceUploadErrorMessage(new Error("An error occurred in the Server Components render. A digest property is included.")))
      .toBe("화면이 새 버전으로 업데이트되었습니다. 새로고침한 후 증빙파일을 다시 선택해 주세요.");
  });

  it("turns masked approval Server Action errors into an actionable instruction", () => {
    expect(getApprovalTransitionErrorMessage(new Error("An error occurred in the Server Components render. A digest property is included.")))
      .toBe("승인처리 중 서버 오류가 발생했습니다. 새로고침 후 계정 연결 상태를 확인해 주세요.");
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

  it("selects an author-safe default approval route", () => {
    expect(createFormState("지결-2026-0001", "2026-11-26", "오학동 사무국장").approvalRoute).toBe("SECRETARY_CHAIR");
    expect(createFormState("지결-2026-0002", "2026-11-26", "장현제 이사").approvalRoute).toBe("DIRECTOR_FULL");
  });

  it("shows the current accounting-review route in the draft overview and document without rewriting completed history", async () => {
    vi.useRealTimers();
    const legacyParticipants = [
      { name: "장현제", title: "이사", action: "규정상 생략" as const },
      { name: "오학동", title: "사무국장", action: "작성" as const },
      { name: "안동연", title: "조합장", action: "최종결재" as const, approvalOrder: 1 },
    ];
    const legacyLine = [{ approver: "안동연", order: 1, role: "최종결재", status: "결재대기" as const }];
    const draft = expenseResolutionFixture({
      actualExpenseDate: "2026-06-20",
      author: "오학동 사무국장",
      approvalLine: legacyLine,
      approvalParticipants: legacyParticipants,
      approvalPolicy: createExpenseApprovalPolicy("CURRENT", "", "2026-06-30"),
      approvalStatus: "작성중",
      draftedAt: "2026-06-30 06:42",
    });
    expect(getDocumentApprovalParticipants(draft).map((person) => [person.name, person.action, person.statusLabel])).toEqual([
      ["장현제", "회계검토", "서명란"],
      ["오학동", "작성", "작성완료"],
      ["안동연", "최종결재", "서명란"],
    ]);
    expect(getDocumentApprovalParticipants({ ...draft, approvalStatus: "승인완료" })[0].action).toBe("규정상 생략");

    render(<ExpenseResolutionPage initialResolutions={[draft]} />);
    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const flow = await screen.findByRole("list", { name: "결의 진행 단계" });
    expect(within(flow).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "작성 완료", "장현제 회계검토", "안동연 최종결재", "지급", "전표",
    ]);
    expect(within(flow).getByText("작성 완료")).toHaveAttribute("aria-current", "step");
    expect(within(flow).getByText("장현제 회계검토")).not.toHaveAttribute("aria-current");

    fireEvent.click(screen.getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "A4 출력 미리보기" }));
    const preview = within(await screen.findByRole("dialog", { name: "지출결의서 출력 미리보기" }));
    const approvalBox = within(preview.getByRole("region", { name: "결재선" }));
    expect(approvalBox.getAllByRole("columnheader").slice(1).map(header => header.textContent)).toEqual(["이사", "사무국장", "조합장"]);
    expect(approvalBox.getByText("장현제").closest("td")).toHaveTextContent("장현제회계검토서명란");
    expect(approvalBox.getByText("오학동").closest("td")).toHaveTextContent("오학동작성06.30 06:42");
    expect(approvalBox.getByText("안동연").closest("td")).toHaveTextContent("안동연최종결재서명란");
  });

  it("prints the saved processing time for a signed step and leaves an unsigned step blank", () => {
    const resolution = expenseResolutionFixture({
      approvalPolicy: createExpenseApprovalPolicy("CURRENT", "", "2026-07-01"),
      approvalRoute: "SECRETARY_CHAIR",
      approvalStatus: "승인대기",
      approvalLine: [
        { approver: "장현제", order: 1, role: "회계검토", status: "승인완료", processedAt: "2026-07-02T10:45:00+09:00" },
        { approver: "안동연", order: 2, role: "최종결재", status: "결재대기" },
      ],
      approvalParticipants: [
        { name: "장현제", title: "이사", action: "회계검토", approvalOrder: 1 },
        { name: "오학동", title: "사무국장", action: "작성" },
        { name: "안동연", title: "조합장", action: "최종결재", approvalOrder: 2 },
      ],
    });
    expect(getDocumentApprovalParticipants(resolution)).toMatchObject([
      { name: "장현제", statusLabel: "승인완료", processedAt: "2026-07-02T10:45:00+09:00" },
      { name: "오학동", statusLabel: "작성완료" },
      { name: "안동연", statusLabel: "서명란", processedAt: undefined },
    ]);
  });

  it("uses the recorded submission date for the progress and print of a legacy pending expense", async () => {
    vi.useRealTimers();
    const resolution = legacyPendingSecretaryExpenseFixture();
    render(<ExpenseResolutionPage initialResolutions={[resolution]} />);
    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const detail = within(await screen.findByRole("region", { name: "지출결의서 상세" }));
    const flow = within(detail.getByRole("list", { name: "결의 진행 단계" }));
    expect(flow.getByText("장현제 회계검토")).toBeInTheDocument();
    expect(flow.getByText("안동연 최종결재")).not.toHaveAttribute("aria-current");
    expect(detail.getByText(/회계검토가 빠진 결재선입니다/)).toBeInTheDocument();

    fireEvent.click(detail.getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(detail.getByRole("menuitem", { name: "A4 출력 미리보기" }));
    const preview = within(await screen.findByRole("dialog", { name: "지출결의서 출력 미리보기" }));
    const approvalBox = within(preview.getByRole("region", { name: "결재선" }));
    expect(approvalBox.getByText("장현제").closest("td")).toHaveTextContent("장현제회계검토서명란");
    expect(approvalBox.getByText("오학동").closest("td")).toHaveTextContent("오학동작성11.12 09:25");
    expect(approvalBox.getByText("안동연").closest("td")).toHaveTextContent("안동연최종결재서명란");
    expect(approvalBox.getByText("상신일 기준 2026-11-14")).toBeInTheDocument();
    expect(approvalBox.queryByText("규정상 생략")).not.toBeInTheDocument();
  });

  it("prints written evidence explanations, attachments, and linked payment sources in priority order", () => {
    expect(getExpensePrintEvidenceText(expenseResolutionFixture({
      evidenceFiles: [{ evidenceType: "카드매출전표", ocrData: {}, id: "evidence-1" } as ExpenseEvidenceAttachment],
      missingEvidenceReason: "사용자가 입력한 대체증빙 설명",
    }))).toBe("사용자가 입력한 대체증빙 설명");
    expect(getExpensePrintEvidenceText(expenseResolutionFixture({
      evidenceFiles: [{ evidenceType: "카드매출전표", ocrData: {}, id: "evidence-1" } as ExpenseEvidenceAttachment],
    }))).toBe("카드매출전표 1건 첨부");
    expect(getExpensePrintEvidenceText(expenseResolutionFixture({ missingEvidenceReason: "직접 작성한 확인 근거" })))
      .toBe("직접 작성한 확인 근거");
    expect(getExpensePrintEvidenceText(expenseResolutionFixture({
      bankTransactions: Array.from({ length: 12 }, (_, index) => ({ id: `bank-${index}` })) as never,
      cardSettlementMode: "BANK_DIRECT",
      cardVerificationSource: "BANK_TRANSACTION",
      expenseBurdenType: "CORPORATE_CARD",
    }))).toBe("법인 체크카드 사용 · 조합 통장 건별출금 내역 12건으로 결제 확인");
    expect(getExpensePrintEvidenceText(expenseResolutionFixture({ cardTransactionId: "card-1", expenseBurdenType: "CORPORATE_CARD" })))
      .toBe("공용 법인카드 승인내역으로 대체 · 카드 승인내역 연결");
    expect(getExpensePrintEvidenceText(expenseResolutionFixture({ bankTransactionId: "bank-1" })))
      .toBe("조합 통장 거래내역 1건 연결 · 원본 거래로 결제 확인");
    expect(getExpensePrintEvidenceText(expenseResolutionFixture())).toBe("증빙 미첨부 · 사유 미입력");
  });

  it("uses the detail column for a compact readable expense description", () => {
    expect(getExpensePrintItemDescription({
      ...batchExpenseItem(1, 18_000),
      description: "2026-01-07 옛골식당 업무식대 · 조합계좌 출금 원본 연결",
      memo: "참석 2명",
    })).toBe("업무식대\n조합계좌 출금 원본 연결");
  });
  beforeEach(() => {
    localStorage.clear();
    navigation.push.mockReset();
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
    expect(screen.getByRole("button", { name: "전체 결의서" })).toBeInTheDocument();
    expect(within(listTable).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(listTable).getByRole("columnheader", { name: "상태" })).toBeInTheDocument();
    expect(within(listTable).queryByRole("columnheader", { name: "예산상태" })).not.toBeInTheDocument();
    expect(within(listTable).queryByRole("columnheader", { name: "증빙" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "작성 양식" })).not.toBeInTheDocument();
    expect(screen.queryByText(/지결-2026-000[1-5]/)).not.toBeInTheDocument();
  });

  it("filters expense resolutions by the actual expense month", () => {
    render(<ExpenseResolutionPage initialResolutions={[
      expenseResolutionFixture({ actualExpenseDate: "2026-01-30", id: "january", resolutionNo: "TEST-2026-01" }),
      expenseResolutionFixture({ actualExpenseDate: "2026-02-03", id: "february", resolutionNo: "TEST-2026-02" }),
    ]} />);

    fireEvent.change(screen.getByLabelText("지출결의 실제 지출월"), { target: { value: "2026-01" } });

    const list = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(list).getByText("TEST-2026-01")).toBeInTheDocument();
    expect(within(list).queryByText("TEST-2026-02")).not.toBeInTheDocument();
    expect(screen.getByText("2026년 1월 · 전체 기준 1건", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/실제 지출일이 없는 결의서는 월 검색에서 제외/)).toBeInTheDocument();
  });

  it("does not label a grouped bank-linked draft as unlinked", () => {
    render(<ExpenseResolutionPage initialResolutions={[expenseResolutionFixture({
      bankTransactionId: undefined,
      bankTransactions: [{ id: "bank-1" }, { id: "bank-2" }] as never,
      expenseKind: "BANK_POST_APPROVAL",
      isPostApproval: true,
    })]} />);

    expect(screen.queryByText("통장 미연결")).not.toBeInTheDocument();
  });

  it("sorts the resolution content column by actual expense date and keeps missing dates last", () => {
    render(<ExpenseResolutionPage initialResolutions={[
      expenseResolutionFixture({ actualExpenseDate: "2026-01-12", id: "later", resolutionNo: "TEST-2026-0012" }),
      expenseResolutionFixture({ actualExpenseDate: undefined, id: "missing", resolutionNo: "TEST-2026-9999" }),
      expenseResolutionFixture({ actualExpenseDate: "2026-01-08", id: "earlier", resolutionNo: "TEST-2026-0008" }),
    ]} />);
    const list = screen.getByRole("table", { name: "지출결의서 목록" });
    const listedNumbers = () => within(list).getAllByRole("button", { name: /상세보기$/ })
      .map((button) => button.getAttribute("aria-label")!.split(" ")[0]);

    fireEvent.click(screen.getByRole("button", { name: "실제 지출일 오래된순으로 정렬" }));
    expect(listedNumbers()).toEqual(["TEST-2026-0008", "TEST-2026-0012", "TEST-2026-9999"]);
    expect(screen.getByRole("columnheader", { name: /지출일/ })).toHaveAttribute("aria-sort", "ascending");

    fireEvent.click(screen.getByRole("button", { name: "실제 지출일 최신순으로 정렬" }));
    expect(listedNumbers()).toEqual(["TEST-2026-0012", "TEST-2026-0008", "TEST-2026-9999"]);
    expect(screen.getByRole("columnheader", { name: /지출일/ })).toHaveAttribute("aria-sort", "descending");
  });

  it("shows an approval-focused single-expense detail workspace", async () => {
    render(<ExpenseResolutionPage initialResolutions={[expenseResolutionFixture({ budgetOverReason: undefined, totalPaymentAmount: 252_000, vendorName: "옛골식당" })]} />);

    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    await act(async () => {
      await import("./expense-budget-inspector");
      await vi.runOnlyPendingTimersAsync();
    });
    const dialog = screen.getByRole("region", { name: "지출결의서 상세" });

    expect(within(dialog).getByText("옛골식당")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "결재 진행" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText("결재선·예산·지급 정보"));
    expect(within(dialog).getByRole("heading", { name: "예산 판단" })).toBeInTheDocument();
    expect(within(dialog).getAllByText("예산 미편성").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("공식 예산이 없습니다. 예산 편성·조정 후 항목과 귀속월을 연결해주세요.")).toBeInTheDocument();
    expect(within(dialog).getAllByText("252,000원").length).toBeGreaterThan(0);
  });

  it("loads authoritative child data only when a resolution detail is opened", async () => {
    vi.useRealTimers();
    const summary = expenseResolutionFixture({ id: "lazy-detail", vendorName: "목록 거래처" });
    const detail = expenseResolutionFixture({ id: "lazy-detail", resolutionNo: "DETAIL-0042", vendorName: "상세 거래처" });
    const loadResolutionDetail = vi.fn(async () => detail);
    render(<ExpenseResolutionPage initialResolutions={[summary]} loadResolutionDetail={loadResolutionDetail} />);
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });

    expect(loadResolutionDetail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    await waitFor(() => expect(loadResolutionDetail).toHaveBeenCalledWith("lazy-detail"));
    const dialog = await screen.findByRole("region", { name: "지출결의서 상세" });
    expect(within(dialog).getByText("DETAIL-0042")).toBeInTheDocument();
  });

  it("moves through the filtered list without changing the search or reopening the record as a modal", () => {
    render(<ExpenseResolutionPage initialResolutions={[
      expenseResolutionFixture({ id: "first", subject: "복사용지", vendorName: "문구점" }),
      expenseResolutionFixture({ id: "excluded", subject: "인쇄비", vendorName: "인쇄소" }),
      expenseResolutionFixture({ id: "next", subject: "볼펜", vendorName: "문구점", resolutionNo: "TEST-0003" }),
    ]} />);
    const search = screen.getByRole("textbox", { name: "지출결의서 검색" });
    fireEvent.change(search, { target: { value: "문구점" } });
    const list = within(screen.getByRole("table", { name: "지출결의서 목록" }));
    expect(list.queryByText("인쇄비")).not.toBeInTheDocument();
    fireEvent.click(list.getByRole("button", { name: /복사용지 상세보기$/ }));
    const detail = within(screen.getByRole("region", { name: "지출결의서 상세" }));
    expect(detail.getByRole("button", { name: "이전 결의서" })).toBeDisabled();
    fireEvent.click(detail.getByRole("button", { name: "다음 결의서" }));
    expect(screen.getByRole("heading", { name: /볼펜$/ })).toBeInTheDocument();
    expect(list.getByRole("button", { name: /볼펜 상세보기$/ })).toHaveAttribute("aria-current", "true");
    expect(search).toHaveValue("문구점");
    expect(screen.queryByRole("dialog", { name: "지출결의서 상세" })).not.toBeInTheDocument();
  });

  it("does not count bank descriptions as uploaded evidence files", async () => {
    const items = Array.from({ length: 12 }, (_, index) => batchExpenseItem(index + 1, 18_000));
    render(<ExpenseResolutionPage initialResolutions={[expenseResolutionFixture({
      evidenceAttached: false,
      evidenceFiles: [],
      evidenceMaterials: items.map((item) => `조합계좌 출금내역 ${item.expenseDate}`),
      expenseItems: items,
      itemCount: items.length,
      resolutionType: "BATCH",
      totalPaymentAmount: 216_000,
    })]} />);

    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    await act(async () => {
      await import("./expense-budget-inspector");
      await vi.runOnlyPendingTimersAsync();
    });
    const dialog = screen.getByRole("region", { name: "지출결의서 상세" });
    fireEvent.click(within(dialog).getByRole("button", { name: "증빙" }));
    expect(within(dialog).getByRole("heading", { name: "증빙자료 (0건)" })).toBeInTheDocument();
    expect(within(dialog).getByText("첨부된 증빙이 없습니다.")).toBeInTheDocument();
    expect(within(dialog).queryByText("12/12 첨부")).not.toBeInTheDocument();
  });

  it("prints the reason and evidence after the final detailed expense row", () => {
    const items = Array.from({ length: 12 }, (_, index) => batchExpenseItem(index + 1, 18_000));
    render(<ExpenseResolutionPrintPreviewModal
      onClose={() => undefined}
      resolution={expenseResolutionFixture({
        expenseItems: items,
        itemCount: items.length,
        reason: "1월 업무식대 일괄 사후결의",
        resolutionType: "BATCH",
        supplyAmount: 216_000,
        totalPaymentAmount: 216_000,
      })}
    />);

    const printDialog = screen.getByRole("dialog", { name: "지출결의서 출력 미리보기" });
    const documentPages = printDialog.querySelectorAll<HTMLElement>(".expense-resolution-document-page");
    expect(documentPages).toHaveLength(2);
    expect(printDialog.querySelector(".expense-resolution-print-empty-row")).not.toBeInTheDocument();
    expect(within(documentPages[0]).queryByRole("heading", { name: "지출사유 및 증빙" })).not.toBeInTheDocument();
    expect(within(documentPages[1]).getByRole("heading", { name: "세부 지출내역 (계속)" })).toBeInTheDocument();
    expect(within(documentPages[1]).queryByText(/계속지/)).not.toBeInTheDocument();
    expect(within(documentPages[1]).getByRole("heading", { name: "지출사유 및 증빙" })).toBeInTheDocument();
    expect(documentPages[1].textContent?.indexOf("2026-01-18")).toBeLessThan(documentPages[1].textContent?.indexOf("지출사유 및 증빙") ?? -1);
  });

  it("shows 장현제 as 이사 on an unresolved legacy approval line", () => {
    render(<ExpenseResolutionPage initialResolutions={[expenseResolutionFixture({
      approvalLine: [
        { approver: "장현제", order: 1, role: "담당자", status: "결재대기" },
        { approver: "오학동", order: 2, role: "사무국장", status: "대기" },
        { approver: "안동연", order: 3, role: "조합장", status: "대기" },
      ],
      approvalStatus: "승인대기",
      currentApprover: "장현제 담당자",
    })]} />);

    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const dialog = screen.getByRole("region", { name: "지출결의서 상세" });
    fireEvent.click(within(dialog).getByText("결재선·예산·지급 정보"));
    expect(within(dialog).getByText("원문 결재일 확인 필요")).toBeInTheDocument();
    expect(within(dialog).getByText("장현제").parentElement).toHaveTextContent("장현제이사");
    expect(within(dialog).queryByText("담당자")).not.toBeInTheDocument();
  });

  it.each([
    { referenceDate: "2026-06-30", showDirector: false },
    { referenceDate: "2026-07-01", showDirector: true },
  ])("uses $referenceDate for both detail and A4 approval display", async ({ referenceDate, showDirector }) => {
    vi.useRealTimers();
    const approvalPolicy = showDirector
      ? createExpenseApprovalPolicy("CURRENT", "", referenceDate)
      : createExpenseApprovalPolicy("HISTORICAL", referenceDate, "2026-07-01", "원문 서명일 확인");
    const resolution = expenseResolutionFixture({
      actualExpenseDate: "2026-06-25", approvalPolicy, approvalStatus: "승인대기", currentApprover: "장현제 이사",
      approvalLine: [
        { approver: "장현제", order: 1, role: "이사", status: "결재대기" },
        { approver: "안동연", order: 2, role: "조합장", status: "승인완료", processedAt: "2026-06-30 10:00" },
      ],
      approvalParticipants: [
        { name: "장현제", title: "이사", action: "검토", approvalOrder: 1 },
        { name: "안동연", title: "조합장", action: "최종결재", approvalOrder: 2 },
      ],
    });
    render(<ExpenseResolutionPage initialResolutions={[resolution]} />);

    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const detail = within(await screen.findByRole("region", { name: "지출결의서 상세" }));
    const flow = within(detail.getByRole("list", { name: "결의 진행 단계" }));
    expect(Boolean(flow.queryByText("장현제 결재대기"))).toBe(showDirector);
    expect(flow.getByText("안동연 승인완료")).toBeInTheDocument();
    fireEvent.click(detail.getByText("결재선·예산·지급 정보"));
    const detailApproval = within(detail.getByRole("region", { name: "결재선" }));
    expect(Boolean(detailApproval.queryAllByText("장현제").length)).toBe(showDirector);
    expect(detailApproval.getByText(`문서 표시 · ${showDirector ? 2 : 1}명`)).toBeInTheDocument();
    if (!showDirector) expect(detailApproval.getByText(/저장된 결재선이 기준일과 맞지 않습니다/)).toBeInTheDocument();
    fireEvent.click(detail.getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(detail.getByRole("menuitem", { name: "A4 출력 미리보기" }));

    const preview = within(await screen.findByRole("dialog", { name: "지출결의서 출력 미리보기" }));
    const approvalBox = within(preview.getByRole("region", { name: "결재선" }));
    expect(Boolean(approvalBox.queryByText("장현제"))).toBe(showDirector);
    expect(approvalBox.getByText("안동연")).toBeInTheDocument();
    expect(approvalBox.getByText("06.30 10:00")).toBeInTheDocument();
    expect(resolution.approvalLine.map((step) => step.order)).toEqual([1, 2]);
  });

  it("keeps June authorship in basic information and leaves an unconfirmed A4 basis explicit", () => {
    const resolution = expenseResolutionFixture({
      author: "장현제 이사",
      approvalPolicy: createExpenseApprovalPolicy("HISTORICAL", "2026-06-30", "2026-07-01", "원문 서명일 확인"),
      approvalParticipants: [
        { name: "장현제", title: "이사", action: "작성" },
        { name: "안동연", title: "조합장", action: "최종결재", approvalOrder: 1 },
      ],
    });
    const { rerender } = render(<ExpenseResolutionPrintPreviewModal onClose={() => undefined} resolution={resolution} />);
    expect(within(screen.getByRole("region", { name: "결재선" })).queryByText("장현제")).not.toBeInTheDocument();
    expect(screen.getByText("장현제")).toBeInTheDocument();

    rerender(<ExpenseResolutionPrintPreviewModal onClose={() => undefined} resolution={{ ...resolution, approvalPolicy: undefined }} />);
    expect(within(screen.getByRole("region", { name: "결재선" })).getByText("원문 결재일 확인 필요")).toBeInTheDocument();
  });

  it("waits for the original date in edit approval review and changes the approval box at the cutoff", async () => {
    vi.useRealTimers();
    const resolution = expenseResolutionFixture({ id: "historical-edit", approvalRoute: "DIRECTOR_FULL" });
    render(<ExpenseResolutionPage
      initialEditResolutionId={resolution.id}
      initialResolutions={[resolution]}
      viewer={{ active: true, display_name: "관리자", organization_id: "org", permissions: ["ADMIN"], user_id: "admin" }}
    />);

    const edit = within(await getExpenseResolutionForm("지출결의서 수정"));
    fireEvent.click(edit.getByRole("button", { name: "승인요청 검토" }));
    fireEvent.change(edit.getByLabelText("결재 기준 구분"), { target: { value: "HISTORICAL" } });
    expect(edit.getByText("원문 결재일 확인 필요")).toBeInTheDocument();
    expect(edit.queryByRole("table", { name: "문서 결재란" })).not.toBeInTheDocument();

    const originalDate = edit.getByLabelText("원문 결재 기준일");
    fireEvent.change(originalDate, { target: { value: "2026-06-30" } });
    expect(within(edit.getByRole("table", { name: "문서 결재란" })).queryByText("장현제")).not.toBeInTheDocument();
    fireEvent.change(originalDate, { target: { value: "2026-07-01" } });
    expect(within(edit.getByRole("table", { name: "문서 결재란" })).getByText("장현제")).toBeInTheDocument();
  });

  it("compresses multiple expenses and expands one row on demand", () => {
    const items = [batchExpenseItem(1, 18_000), batchExpenseItem(2, 36_000)];
    render(<ExpenseResolutionPage initialResolutions={[expenseResolutionFixture({
      budgetItem: "운영비 > 복리후생비(식대)",
      budgetSnapshot: { budgetCheckStatus: "정상", budgetPeriod: "2026-01", budgetUsageRate: 8.3, calculationBasis: "총회 승인 운영비", currentAnnualBudgetAmount: 7_800_000, currentRequestAmount: 54_000, expectedUsedAmount: 54_000, monthlyBudgetAmount: 650_000, paymentWaitingAmount: 0, pendingApprovalAmount: 0, previousAnnualBudgetAmount: 0, remainingBudgetAmount: 596_000, usedAmount: 0 },
      expenseItems: items,
      itemCount: items.length,
      representativeVendorName: "옛골식당",
      resolutionType: "BATCH",
      totalPaymentAmount: 54_000,
    })]} />);

    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const dialog = screen.getByRole("region", { name: "지출결의서 상세" });

    fireEvent.click(within(dialog).getByRole("button", { name: "지출내역" }));
    expect(within(dialog).getByText("다건 지출")).toHaveClass("text-white");
    expect(within(dialog).getByRole("columnheader", { name: "예산귀속" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("columnheader", { name: "실제 지출자" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "1번 지출 상세 펼치기" }));
    expect(within(dialog).getByText("조합 운영계좌")).toBeInTheDocument();
  });

  it("connects contextual approval controls inside the approval inspector", async () => {
    vi.useRealTimers();
    const requestApproval = vi.fn(async () => true);
    render(<ExpenseResolutionDetailModal
      onApprove={() => undefined}
      onClose={() => undefined}
      onPrintArchive={() => undefined}
      onPrintPreview={() => undefined}
      onReject={() => undefined}
      onRequestApproval={requestApproval}
      resolution={expenseResolutionFixture({
        approvalLine: [{ approver: "장현재", order: 1, role: "담당자", status: "결재대기" }],
        authorization: { author_user_id: "author-user", steps: [{ approver_user_id: "approver-user", legacy_step: { approver: "장현재", order: 1, role: "담당자" }, order: 1 }], version: 1 },
      })}
    />);

    fireEvent.click(screen.getByRole("button", { name: "결재 시작 · 승인요청" }));
    await waitFor(() => expect(requestApproval).toHaveBeenCalledOnce());
  });

  it("keeps the next voucher action visible in the detail inspector", () => {
    const createVoucher = vi.fn();
    const confirmVoucher = vi.fn();
    const baseProps = {
      onApprove: () => undefined,
      onClose: () => undefined,
      onPrintArchive: () => undefined,
      onPrintPreview: () => undefined,
      onReject: () => undefined,
      onRequestApproval: () => undefined,
    };
    const { rerender } = render(<ExpenseResolutionDetailModal
      {...baseProps}
      onConfirmVoucher={confirmVoucher}
      onCreateVoucher={createVoucher}
      resolution={expenseResolutionFixture({ approvalStatus: "승인완료", paymentStatus: "지급완료" })}
    />);

    const nextAction = screen.getByRole("region", { name: "다음 할 일" });
    expect(within(nextAction).getByText("상단 단계는 상태 표시야.")).toBeInTheDocument();
    fireEvent.click(within(nextAction).getByRole("button", { name: "전표초안 생성" }));
    expect(createVoucher).toHaveBeenCalledOnce();

    rerender(<ExpenseResolutionDetailModal
      {...baseProps}
      onConfirmVoucher={confirmVoucher}
      onCreateVoucher={createVoucher}
      resolution={expenseResolutionFixture({ approvalStatus: "승인완료", paymentStatus: "지급완료", voucherNo: "지출-2026-0001", voucherStatus: "전표초안" })}
    />);
    fireEvent.click(within(screen.getByRole("region", { name: "다음 할 일" })).getByRole("button", { name: "전표확정" }));
    expect(confirmVoucher).toHaveBeenCalledOnce();

    rerender(<ExpenseResolutionDetailModal
      {...baseProps}
      resolution={expenseResolutionFixture({ approvalStatus: "승인완료", paymentStatus: "지급완료", voucherNo: "지출-2026-0001", voucherStatus: "전표확정" })}
      voucherHref="/finance?resolutionId=resolution-id"
    />);
    expect(screen.getByRole("link", { name: "전표보기" })).toHaveAttribute("href", "/finance?resolutionId=resolution-id");
  });

  it("blocks approval requests and links to account setup when approver accounts are missing", () => {
    const requestApproval = vi.fn();
    render(<ExpenseResolutionDetailModal
      onApprove={() => undefined}
      onClose={() => undefined}
      onPrintArchive={() => undefined}
      onPrintPreview={() => undefined}
      onReject={() => undefined}
      onRequestApproval={requestApproval}
      resolution={expenseResolutionFixture({
        approvalLine: [
          { approver: "장현제", order: 1, role: "담당자", status: "결재대기" },
          { approver: "오학동", order: 2, role: "사무국장", status: "대기" },
          { approver: "안동연", order: 3, role: "조합장", status: "대기" },
        ],
        authorization: { author_user_id: "author-user", steps: [], version: 1 },
      })}
    />);

    expect(screen.getByText("작성자 연결됨 · 결재자 0/3명")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계정 연결 화면 열기" })).toHaveAttribute("href", `/finance/expense-authorizations?id=${encodeURIComponent("fixture-resolution")}`);
    expect(screen.getByRole("button", { name: "계정 연결 필요" })).toBeDisabled();
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("shows the server total and navigates between result pages", () => {
    render(<ExpenseResolutionPage
      initialListPage={{ month: "", page: 2, pageSize: 50, query: "", sort: "updated_desc", total: 120, totalPages: 3 }}
      initialResolutions={[expenseResolutionFixture({ id: "page-2", resolutionNo: "지결-2026-0051" })]}
    />);

    expect(screen.getByRole("button", { name: "전체 결의서" })).toBeInTheDocument();
    expect(screen.getByText(/전체 120건 · 2\/3 페이지/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(navigation.push).toHaveBeenCalledWith("/finance/expense-resolutions?page=3");
  });

  it("updates the workspace height on resize while keeping the selected record and result page", async () => {
    vi.useRealTimers();
    navigation.push.mockClear();
    render(<ExpenseResolutionPage
      initialListPage={{ month: "", page: 2, pageSize: 25, query: "사무용품", sort: "updated_desc", total: 60, totalPages: 3 }}
      initialResolutions={[expenseResolutionFixture({ subject: "사무용품 구매" })]}
    />);

    const list = screen.getByRole("region", { name: "지출결의서 검색 및 목록" });
    const workspace = list.parentElement!;
    const getWorkspaceRect = vi.spyOn(workspace, "getBoundingClientRect");
    getWorkspaceRect.mockReturnValue(new DOMRect(0, 180, 1000, 600));
    fireEvent(window, new Event("resize"));
    expect(workspace.style.getPropertyValue("--expense-resolution-workspace-top")).toBe("180px");

    const row = within(list).getByRole("button", { name: /상세보기$/ });
    fireEvent.click(row);
    const detail = await screen.findByRole("region", { name: "지출결의서 상세" });
    getWorkspaceRect.mockReturnValue(new DOMRect(0, 224, 1000, 450));
    fireEvent(window, new Event("resize"));

    expect(workspace.style.getPropertyValue("--expense-resolution-workspace-top")).toBe("224px");
    expect(screen.getByRole("region", { name: "지출결의서 상세" })).toBe(detail);
    expect(row).toHaveAttribute("aria-current", "true");
    expect(within(list).getByRole("textbox", { name: "지출결의서 검색" })).toHaveValue("사무용품");
    expect(within(list).getByText("2 / 3")).toBeInTheDocument();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("restarts server pagination and preserves the month when expense-date sorting changes", () => {
    render(<ExpenseResolutionPage
      initialListPage={{ month: "2026-01", page: 2, pageSize: 50, query: "", sort: "updated_desc", total: 120, totalPages: 3 }}
      initialResolutions={[expenseResolutionFixture({ actualExpenseDate: "2026-01-08", id: "page-2", resolutionNo: "지결-2026-0051" })]}
    />);

    fireEvent.click(screen.getByRole("button", { name: "실제 지출일 오래된순으로 정렬" }));
    expect(navigation.push).toHaveBeenCalledWith("/finance/expense-resolutions?month=2026-01&sort=expense_date_asc");
  });

  it("uses the server-wide next number when creating from a paginated result", async () => {
    render(<ExpenseResolutionPage
      initialListPage={{ month: "", page: 2, pageSize: 50, query: "", sort: "updated_desc", total: 120, totalPages: 3 }}
      initialNextResolutionNo="지결-2026-0121"
      initialResolutions={[expenseResolutionFixture({ id: "page-2", resolutionNo: "지결-2026-0051" })]}
    />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    expect(within(dialog).getByLabelText("결의서번호")).toHaveValue("지결-2026-0121");
  });

  it("loads creation-only options after the user opens the form and reuses them", async () => {
    vi.useRealTimers();
    const loadFormOptions = vi.fn(async () => ({
      approvalDocuments: [],
      bankTransactions: [],
      cardTransactions: [],
      directExpenseSettings: defaultExpenseComplianceSettings,
      expenseDetails: [],
    }));
    render(<ExpenseResolutionPage initialResolutions={[]} loadFormOptions={loadFormOptions} />);

    expect(loadFormOptions).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    await waitFor(() => expect(loadFormOptions).toHaveBeenCalledOnce());
    const firstDialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.click(within(firstDialog).getByRole("button", { name: "취소" }));

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    await getExpenseResolutionForm("지출결의서 작성");
    expect(loadFormOptions).toHaveBeenCalledOnce();
  });

  it("routes new small expenses away from resolutions and keeps legacy batches read-only", async () => {
    const legacy = expenseResolutionFixture({
      approvalLine: [],
      approvalStatus: "작성중",
      author: "오학동 사무장",
      budgetSnapshot: { budgetCheckStatus: "예산항목 선택 필요", budgetPeriod: "2026-07", budgetUsageRate: 0, calculationBasis: "-", currentAnnualBudgetAmount: 0, currentRequestAmount: 10_000, expectedUsedAmount: 10_000, monthlyBudgetAmount: 0, paymentWaitingAmount: 0, pendingApprovalAmount: 0, previousAnnualBudgetAmount: 0, remainingBudgetAmount: 0, usedAmount: 0 },
      createdAt: "2026-07-01",
      creationSource: "SMALL_EXPENSE",
      evidenceMaterials: [],
      expenseItems: [],
      expenseKind: "PETTY_CASH_BATCH",
      history: [],
      id: "legacy-small-1",
      paymentStatus: "지급전",
      printRecords: [],
      resolutionNo: "지결-2026-0001",
      resolutionType: "SINGLE",
      settlementStatus: "정산없음",
      subject: "기존 소액 묶음",
      supplyAmount: 10_000,
      totalPaymentAmount: 10_000,
      vat: 0,
      vendorName: "과거 거래처",
    });
    render(<ExpenseResolutionPage initialResolutions={[legacy]} />);

    expect(screen.queryByLabelText("소액 일괄결의 필터")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("상세필터"));
    expect(screen.getByRole("link", { name: "소액지출 등록은 지출관리에서 →" })).toHaveAttribute("href", "/finance/expenses/small");
    expect(screen.getByRole("button", { name: "기존 소액 일괄결의 1건" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const createDialog = await getExpenseResolutionForm("지출결의서 작성");
    expect(within(createDialog).queryByText("소액경비 일괄결의", { selector: "button" })).not.toBeInTheDocument();
    expect(within(createDialog).queryByRole("option", { name: "소액경비 일괄결의" })).not.toBeInTheDocument();
    fireEvent.click(within(createDialog).getByRole("button", { name: "취소" }));

    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const detailDialog = screen.getByRole("region", { name: "지출결의서 상세" });
    expect(within(detailDialog).getByText("기존 소액 일괄결의 · 조회 전용")).toBeInTheDocument();
    expect(within(detailDialog).queryByRole("button", { name: "수정" })).not.toBeInTheDocument();
    expect(within(detailDialog).queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  });

  it("keeps the page available when the remote data source is unavailable", () => {
    render(<ExpenseResolutionPage dataLoadError="지출결의 저장소에 연결하지 못했습니다." initialResolutions={[]} />);

    expect(screen.getByRole("alert")).toHaveTextContent("지출결의 저장소에 연결하지 못했습니다.");
    expect(screen.getByRole("heading", { name: "지출결의서 관리" })).toBeInTheDocument();
  });

  it("opens the real creation modal and saves the first draft", async () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    expect(within(dialog).getByLabelText("결의서번호")).toHaveValue("지결-2026-0001");
    expect(within(dialog).getByLabelText("작성자")).toHaveValue("오학동 사무국장");

    fireEvent.click(within(dialog).getByRole("button", { name: "임시저장" }));
    expect(screen.getByRole("button", { name: "전체 결의서" })).toBeInTheDocument();
    expect(screen.getByText("지결-2026-0001")).toBeInTheDocument();
  });

  it("reuses a quick original and its evidence in the shared formal draft", async () => {
    vi.useRealTimers();
    const source: QuickExpenseConversionDraft = {
      amount: 32000, approvalSkipReason: "Policy", budgetItem: "Operating supplies", cardTransactionId: "card-one",
      counterparty: "Paint vendor", evidenceKind: "RECEIPT", evidenceStatus: "GENERAL", expenseDetailId: "detail-one",
      occurredDate: "2026-09-19", paymentMethod: "CORPORATE_CARD", recordStatus: "NEEDS_RESOLUTION", sourceId: "quick-one",
      usageDescription: "Paint supplies", evidenceFiles: [{ contentType: "image/jpeg", evidenceType: "영수증", fileName: "receipt.jpg",
        fileSize: 120, id: "quick-evidence", ocrData: {}, ocrJobId: "job-one", ocrStatus: "EXTRACTED", storageBucket: "expense-evidence",
        storagePath: "org/receipt.jpg", uploadedAt: "2026-09-19T01:00:00Z", uploadedBy: "Verified author" }],
    };
    const convertQuickExpense = vi.fn(async (_sourceId, resolution) => resolution);
    const persistResolution = vi.fn(async (resolution) => resolution);
    render(<ExpenseResolutionPage convertQuickExpense={convertQuickExpense} initialQuickExpense={source} initialResolutions={[]} persistResolution={persistResolution} />);
    const dialog = await getExpenseResolutionForm("간편지출을 정식결의로 전환");
    expect(within(dialog).getByLabelText("건명 (필수)")).toHaveValue("Paint supplies");
    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByLabelText("거래처명")).toHaveValue("Paint vendor");
    expect(within(dialog).getByLabelText("단가 1")).toHaveValue(32000);
    expect(within(dialog).getByText("receipt.jpg")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "임시저장" }));
    await waitFor(() => expect(convertQuickExpense).toHaveBeenCalledWith("quick-one", expect.objectContaining({
      actualExpenseDate: "2026-09-19", budgetItem: "Operating supplies", cardTransactionId: "card-one",
      subject: "Paint supplies", totalPaymentAmount: 32000, vendorName: "Paint vendor",
    })));
    expect(persistResolution).not.toHaveBeenCalled();
  });

  it("automatically saves the shared expense detail from the resolution contents", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const expenseDetails = [{ id: "detail-communications", code: "PUBLIC-COMM", groupName: "공공요금·수수료", name: "통신비", budgetItem: "제세공과금>통신비", status: "CONFIRMED" as const, quickExpenseEligible: true }];
    render(<ExpenseResolutionPage initialExpenseDetails={expenseDetails} initialResolutions={[]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.change(within(dialog).getByLabelText("건명 (필수)"), { target: { value: "조합 사무실 인터넷 요금" } });
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 10)); });
    fireEvent.click(within(dialog).getByRole("button", { name: "임시저장" }));
    await waitFor(() => expect(persistResolution).toHaveBeenCalledWith(expect.objectContaining({ budgetItem: "제세공과금>통신비", expenseDetailId: "detail-communications", operationExpenseDetail: "통신비" })));
  });

  it("preserves an existing account when editing a document without an expense detail", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const resolution = expenseResolutionFixture({
      id: "preserve-account", author: "오학동 사무국장", subject: "업무추진비 축하화환",
      representativeAccountTitle: "업무추진비", reason: "유관기관 행사 축하",
      totalPaymentAmount: 130000, supplyAmount: 130000,
    });
    const expenseDetails = [{ id: "promotion", code: "BUSINESS-PROMOTION", groupName: "업무추진비", name: "업무추진비", budgetItem: "업무추진비", status: "CONFIRMED" as const, quickExpenseEligible: false }];
    render(<ExpenseResolutionPage initialEditResolutionId={resolution.id} initialResolutions={[resolution]} initialExpenseDetails={expenseDetails} persistResolution={persistResolution} />);
    const dialog = within(await getExpenseResolutionForm("지출결의서 수정"));
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 20)); });
    fireEvent.click(dialog.getByRole("button", { name: "수정사항 저장" }));
    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    expect(persistResolution.mock.calls[0][0]).toMatchObject({ representativeAccountTitle: "업무추진비", accountAllocations: [expect.objectContaining({ accountTitle: "업무추진비" })] });
  });

  it("shows a saved promotion account accurately and saves an explicit change to 업무추진비", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const resolution = expenseResolutionFixture({
      id: "change-promotion-account", author: "오학동 사무국장", subject: "업무추진비 축하화환",
      representativeAccountTitle: "사업추진비", totalPaymentAmount: 130000, supplyAmount: 130000,
      budgetItem: "업무추진비",
      accountAllocations: [{ id: "promotion-allocation", accountTitle: "사업추진비", budgetItem: "업무추진비", amount: "130000", description: "축하화환" }],
    });
    render(<ExpenseResolutionPage initialEditResolutionId={resolution.id} initialResolutions={[resolution]} persistResolution={persistResolution} />);
    const dialog = within(await getExpenseResolutionForm("지출결의서 수정"));
    fireEvent.click(dialog.getByRole("button", { name: "금액·계정·예산" }));
    expect(dialog.getByLabelText("분할 계정과목 1")).toHaveValue("사업추진비");
    expect((within(dialog.getByLabelText("분할 계정과목 1")).getByRole("option", { name: "사업추진비" }) as HTMLOptionElement).selected).toBe(true);
    fireEvent.change(dialog.getByLabelText("분할 계정과목 1"), { target: { value: "업무추진비" } });
    expect(dialog.getByLabelText("분할 예산항목 1")).toHaveValue("업무추진비");
    fireEvent.click(dialog.getByRole("button", { name: "승인요청 검토" }));
    expect(dialog.getAllByText("업무추진비").length).toBeGreaterThan(0);
    fireEvent.click(dialog.getByRole("button", { name: "수정사항 저장" }));
    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    expect(persistResolution.mock.calls[0][0]).toMatchObject({ representativeAccountTitle: "업무추진비", accountAllocations: [expect.objectContaining({ accountTitle: "업무추진비", budgetItem: "업무추진비" })] });
  });

  it("shows the selected expense detail instead of the broad allocation group in the inspector", () => {
    const resolution = expenseResolutionFixture({
      id: "account-display", representativeAccountTitle: "사업추진비", reason: "유관기관 행사 축하", vendorName: "축하화환",
      operationExpenseDetail: "업무추진비",
      accountAllocations: [{ id: "allocation", accountTitle: "사업추진비", amount: "130000", budgetItem: "업무추진비", description: "" }],
    });
    render(<ExpenseResolutionPage initialResolutions={[resolution]} />);
    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const detail = within(screen.getByRole("region", { name: "지출결의서 상세" }));
    expect(detail.getByText("업무추진비")).toBeInTheDocument();
    expect(detail.queryByText("사업추진비")).not.toBeInTheDocument();
    expect(detail.getByText("유관기관 행사 축하")).toBeInTheDocument();
  });

  it("shows one post-approval badge and removes the duplicate suffix from an older list title", () => {
    const resolution = expenseResolutionFixture({
      expenseKind: "BANK_POST_APPROVAL",
      id: "legacy-post-approval-display",
      isPostApproval: undefined,
      subject: "2026-10-31 축하화환 사후결의",
    });

    render(<ExpenseResolutionPage initialResolutions={[resolution]} />);

    const row = screen.getByRole("button", { name: "TEST-0001 2026-10-31 축하화환 상세보기" });
    expect(row).toHaveTextContent(/^2026-10-31 축하화환$/);
    fireEvent.click(row);
    const detail = within(screen.getByRole("region", { name: "지출결의서 상세" }));
    expect(detail.getByText("사후결의", { exact: true })).toBeInTheDocument();
    const flow = within(detail.getByRole("list", { name: "결의 진행 단계" }));
    expect(flow.getByText("기존 출금 확인")).toBeInTheDocument();
    expect(flow.queryByText("지급", { exact: true })).not.toBeInTheDocument();
  });

  it("does not show a positive remaining budget as an over-budget badge", () => {
    const resolution = expenseResolutionFixture({
      id: "remaining-budget-display",
      overBudgetItemCount: 0,
      totalOverBudgetAmount: 470_000,
      budgetSnapshot: {
        budgetCheckStatus: "정상",
        budgetPeriod: "2026-10",
        budgetUsageRate: 21.7,
        calculationBasis: "사업추진 관련 업무추진비·경조사 등",
        currentAnnualBudgetAmount: 7_200_000,
        currentRequestAmount: 130_000,
        expectedUsedAmount: 130_000,
        monthlyBudgetAmount: 600_000,
        paymentWaitingAmount: 0,
        pendingApprovalAmount: 130_000,
        previousAnnualBudgetAmount: 0,
        remainingBudgetAmount: 470_000,
        usedAmount: 0,
      },
    });

    render(<ExpenseResolutionPage initialResolutions={[resolution]} />);

    expect(screen.queryByText("예산초과 470,000원")).not.toBeInTheDocument();
  });

  it("lets the author reopen a pending resolution to correct its subject", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const firstRender = render(<ExpenseResolutionPage initialResolutions={[]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const createDialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.change(within(createDialog).getByLabelText("건명 (필수)"), { target: { value: "통신 구입" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: "임시저장" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    const draft = persistResolution.mock.calls[0][0];
    persistResolution.mockClear();
    firstRender.unmount();

    render(<ExpenseResolutionPage initialResolutions={[{ ...draft, approvalStatus: "승인대기", currentApprover: "장현재 담당자" }]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const detailDialog = screen.getByRole("region", { name: "지출결의서 상세" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "수정 후 재요청" }));

    const editDialog = await getExpenseResolutionForm("지출결의서 수정");
    fireEvent.click(within(editDialog).getByRole("button", { name: "지급·거래" }));
    expect(within(editDialog).getByLabelText("건명 (필수)")).toHaveValue("통신 구입");
    expect(within(editDialog).getByText(/수정사항을 저장하면 작성중으로 돌아갑니다/)).toBeInTheDocument();
    fireEvent.change(within(editDialog).getByLabelText("건명 (필수)"), { target: { value: "우편 발송비" } });
    expect(within(editDialog).getByLabelText("건명 (필수)")).toHaveValue("우편 발송비");
    fireEvent.click(within(editDialog).getByRole("button", { name: "수정사항 저장" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    expect(persistResolution.mock.calls[0][0]).toMatchObject({ approvalStatus: "작성중", subject: "우편 발송비" });
  });

  it("keeps the list mounted when the signed-in author edits and cancels", async () => {
    vi.useRealTimers();
    navigation.push.mockClear();
    const viewer = { active: true, display_name: "작성자", organization_id: "org", permissions: [], user_id: "author" };
    const resolution = expenseResolutionFixture({
      reason: "기존 업무목적",
      authorization: { author_user_id: viewer.user_id, steps: [], version: 1 },
    });
    const persistResolution = vi.fn();
    render(<ExpenseResolutionPage
      initialListPage={{ month: "", page: 2, pageSize: 25, query: "사무용품", sort: "updated_desc", total: 26, totalPages: 2 }}
      initialResolutions={[resolution]}
      persistResolution={persistResolution}
      viewer={viewer}
    />);
    const list = screen.getByRole("region", { name: "지출결의서 검색 및 목록" });
    const row = within(list).getByRole("button", { name: /상세보기$/ });
    fireEvent.click(row);
    fireEvent.click(within(await screen.findByRole("region", { name: "지출결의서 상세" })).getByRole("button", { name: "수정" }));

    const editor = within(await getExpenseResolutionForm("지출결의서 수정"));
    expect(screen.queryByRole("dialog", { name: "지출결의서 수정" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "지출결의서 검색 및 목록" })).toBe(list);
    expect(within(list).getByRole("textbox", { name: "지출결의서 검색" })).toHaveValue("사무용품");
    expect(row).toHaveAttribute("aria-current", "true");
    expect(row).toBeDisabled();
    fireEvent.change(editor.getByRole("textbox", { name: "업무목적" }), { target: { value: "임시 입력" } });
    fireEvent.click(editor.getByRole("button", { name: "취소" }));

    const detail = within(await screen.findByRole("region", { name: "지출결의서 상세" }));
    expect(detail.getByText("기존 업무목적")).toBeInTheDocument();
    expect(detail.queryByText("임시 입력")).not.toBeInTheDocument();
    expect(row).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(persistResolution).not.toHaveBeenCalled();
  });

  it("saves the business purpose from the first edit screen and shows it in detail and A4 preview", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const resolution = expenseResolutionFixture({
      id: "edit-purpose", author: "오학동 사무국장", reason: "사무용 소모품 구입",
      subject: "사무국 소모품", vendorName: "테스트 거래처", actualExpenseDate: "2026-10-29",
      expenseKind: "BANK_POST_APPROVAL", expenseTiming: "REIMBURSEMENT", bankTransactionId: "source-withdrawal",
      postApprovalReason: "사전 결의 전에 정기 거래가 집행됨", budgetItem: "소모품비", totalPaymentAmount: 57520, supplyAmount: 57520,
      accountAllocations: [{ id: "office-allocation", accountTitle: "소모품비", budgetItem: "소모품비", amount: "57520", description: "" }],
    });
    const purpose = "사무국 회의자료를 보관하기 위한 파일과 문서함 구입";
    render(<ExpenseResolutionPage initialEditResolutionId={resolution.id} initialResolutions={[resolution]} persistResolution={persistResolution} />);

    const editDialog = within(await getExpenseResolutionForm("지출결의서 수정"));
    expect(editDialog.getByRole("textbox", { name: "업무목적" })).toHaveValue(resolution.reason);
    expect(editDialog.getByRole("button", { name: "금액·계정·예산" })).toHaveAttribute("aria-expanded", "false");
    expect(editDialog.queryByRole("navigation", { name: "지출결의 작성 단계" })).not.toBeInTheDocument();
    expect(editDialog.queryByRole("heading", { name: "승인 전 확인" })).not.toBeInTheDocument();
    expect(editDialog.queryByText(/수정사항을 저장하면 작성중으로 돌아갑니다/)).not.toBeInTheDocument();
    fireEvent.change(editDialog.getByRole("textbox", { name: "업무목적" }), { target: { value: purpose } });
    fireEvent.click(editDialog.getByRole("button", { name: "수정사항 저장" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    expect(persistResolution.mock.calls[0][0]).toMatchObject({
      id: resolution.id, reason: purpose, bankTransactionId: resolution.bankTransactionId,
      totalPaymentAmount: resolution.totalPaymentAmount, postApprovalReason: resolution.postApprovalReason,
      accountAllocations: resolution.accountAllocations,
    });
    const detailDialog = within(await screen.findByRole("region", { name: "지출결의서 상세" }));
    expect(detailDialog.getByText(purpose)).toBeInTheDocument();
    fireEvent.click(detailDialog.getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(detailDialog.getByRole("menuitem", { name: "A4 출력 미리보기" }));
    const preview = within(await screen.findByRole("dialog", { name: "지출결의서 출력 미리보기" }));
    expect(preview.getAllByText(purpose).length).toBeGreaterThan(0);
  });

  it("keeps the saved detail open if the updated record moves off the current server page", async () => {
    vi.useRealTimers();
    const resolution = expenseResolutionFixture({
      id: "moving-edit", author: "오학동 사무국장", reason: "이전 업무목적", subject: "목록 이동 대상",
    });
    const nextRow = expenseResolutionFixture({ id: "remaining-row", subject: "남아 있는 결의서" });
    const listPage = { month: "", page: 2, pageSize: 25, query: "", sort: "updated_desc", total: 26, totalPages: 2 } as const;
    const persistResolution = vi.fn(async (draft) => draft);
    const { rerender } = render(<ExpenseResolutionPage initialEditResolutionId={resolution.id} initialListPage={listPage} initialResolutions={[resolution, nextRow]} persistResolution={persistResolution} />);
    const editor = within(await getExpenseResolutionForm("지출결의서 수정"));
    fireEvent.change(editor.getByRole("textbox", { name: "업무목적" }), { target: { value: "저장된 업무목적" } });
    fireEvent.click(editor.getByRole("button", { name: "수정사항 저장" }));
    const detail = await screen.findByRole("region", { name: "지출결의서 상세" });
    expect(within(detail).getByText("저장된 업무목적")).toBeInTheDocument();

    rerender(<ExpenseResolutionPage initialEditResolutionId={resolution.id} initialListPage={listPage} initialResolutions={[nextRow]} persistResolution={persistResolution} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /목록 이동 대상 상세보기$/ })).not.toBeInTheDocument());
    expect(within(detail).getByText("저장된 업무목적")).toBeInTheDocument();
  });

  it("edits the document and line-item purposes of a batch independently", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const line = batchExpenseItem(1, 12000);
    const resolution = expenseResolutionFixture({
      author: "오학동 사무국장", id: "edit-batch-purpose", resolutionType: "BATCH", expenseItems: [line],
      reason: "회의 관련 지출", totalPaymentAmount: 12000, supplyAmount: 12000,
    });
    render(<ExpenseResolutionPage initialEditResolutionId={resolution.id} initialResolutions={[resolution]} persistResolution={persistResolution} />);

    const dialog = within(await getExpenseResolutionForm("지출결의서 수정"));
    fireEvent.click(dialog.getByText("항목별 업무목적"));
    expect(dialog.getByRole("textbox", { name: "1행 업무목적 · 업무식대" })).toHaveValue(line.businessPurpose);
    fireEvent.change(dialog.getByRole("textbox", { name: "업무목적" }), { target: { value: "회의 운영에 필요한 비용" } });
    fireEvent.change(dialog.getByRole("textbox", { name: "1행 업무목적 · 업무식대" }), { target: { value: "월간 업무회의 참석자 식대" } });
    fireEvent.click(dialog.getByRole("button", { name: "수정사항 저장" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    expect(persistResolution.mock.calls[0][0]).toMatchObject({
      reason: "회의 운영에 필요한 비용",
      expenseItems: [{ id: line.id, businessPurpose: "월간 업무회의 참석자 식대", totalAmount: 12000 }],
    });
  });

  it("reviews an approved purpose correction before saving its audit reason and changed field", async () => {
    vi.useRealTimers();
    const onSave = vi.fn(async () => {});
    const resolution = expenseResolutionFixture({ approvalStatus: "승인완료", reason: "회의 진행", correctionRevision: 2 });
    render(<ExpenseResolutionCorrectionForm onClose={vi.fn()} onSave={onSave} resolution={resolution} />);

    expect(screen.getByRole("textbox", { name: "업무목적" })).toHaveValue("회의 진행");
    expect(screen.getByText("건명·내부메모 정정").closest("details")).not.toHaveAttribute("open");
    fireEvent.change(screen.getByRole("textbox", { name: "업무목적" }), { target: { value: "정기 이사회 자료 준비" } });
    fireEvent.change(screen.getByRole("textbox", { name: "정정 사유" }), { target: { value: "사용 목적을 구체화함" } });
    fireEvent.click(screen.getByRole("button", { name: "변경 내용 확인" }));

    expect(screen.getByText("변경 전").parentElement).toHaveTextContent("회의 진행");
    expect(screen.getByText("변경 후").parentElement).toHaveTextContent("정기 이사회 자료 준비");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "정정 저장" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: resolution.id, revision: 2, reason: "사용 목적을 구체화함", patch: { reason: "정기 이사회 자료 준비" },
    })));
  });

  it("opens an authorized resolution directly in edit mode", async () => {
    const resolution = expenseResolutionFixture({
      author: "오학동 사무국장",
      id: "direct-edit-draft",
      resolutionNo: "지결-2026-0255",
      subject: "축하화환 사후결의",
    });

    render(<ExpenseResolutionPage initialEditResolutionId={resolution.id} initialResolutions={[resolution]} />);

    const editDialog = within(await getExpenseResolutionForm("지출결의서 수정"));
    expect(editDialog.getByText("지결-2026-0255 · 축하화환 사후결의")).toBeInTheDocument();
    fireEvent.click(editDialog.getByRole("button", { name: "지급·거래" }));
    expect(editDialog.getByLabelText("결의서번호")).toHaveValue("지결-2026-0255");
    expect(editDialog.getByLabelText("건명 (필수)")).toHaveValue("축하화환 사후결의");
  });

  it("opens and saves a bank-backed draft whose imported record omits payment and optional text fields", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const resolution = expenseResolutionFixture({
      author: "오학동 사무국장", id: "sparse-bank-draft", subject: "축하화환 사후결의",
      expenseKind: "BANK_POST_APPROVAL", expenseTiming: "REIMBURSEMENT",
      bankTransactionId: "bank-source", supplyAmount: 130000, totalPaymentAmount: 130000,
    });
    // Imported bank drafts have no payout account: the withdrawal already happened.
    const sparse = resolution as Partial<typeof resolution>;
    for (const key of ["accountHolder", "paymentAccountNo", "paymentBank", "budgetOverReason", "relatedContract", "relatedMeeting"] as const) delete sparse[key];
    render(<ExpenseResolutionPage initialEditResolutionId={resolution.id} initialResolutions={[resolution]} persistResolution={persistResolution} />);
    const dialog = within(await screen.findByRole("region", { name: "지출결의서 수정" }));
    fireEvent.click(dialog.getByRole("button", { name: "지급·거래" }));
    expect(dialog.getByText(/직접 입력 · 은행 미입력 계좌 미등록/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "승인요청 검토" }));
    expect(dialog.getByRole("heading", { name: "승인 전 확인" })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "수정 후 승인요청" })).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "검토 닫기" }));
    await waitFor(() => expect(dialog.getByRole("textbox", { name: "업무목적" })).toHaveFocus());
    fireEvent.click(dialog.getByRole("button", { name: "수정사항 저장" }));
    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    expect(persistResolution.mock.calls[0][0]).toMatchObject({ bankTransactionId: "bank-source", totalPaymentAmount: 130000, paymentAccountNo: "", paymentBank: "", accountHolder: "" });
  });

  it("removes edit mode from a direct link and keeps its search and selected detail", async () => {
    vi.useRealTimers();
    const resolution = expenseResolutionFixture({ author: "오학동 사무국장", id: "direct-edit-cancel" });
    const originalUrl = window.location.href;
    window.history.replaceState(null, "", `/finance/expense-resolutions?page=2&resolutionId=${resolution.id}&mode=edit`);
    try {
      render(<ExpenseResolutionPage initialEditResolutionId={resolution.id} initialResolutions={[resolution]} />);
      const editor = within(await screen.findByRole("region", { name: "지출결의서 수정" }));
      fireEvent.click(editor.getByRole("button", { name: "취소" }));
      expect(await screen.findByRole("region", { name: "지출결의서 상세" })).toBeInTheDocument();
      expect(window.location.search).toBe(`?page=2&resolutionId=${resolution.id}`);
    } finally {
      window.history.replaceState(null, "", originalUrl);
    }
  });

  it("keeps the detail open if the edit options fail to load", async () => {
    vi.useRealTimers();
    const resolution = expenseResolutionFixture({ id: "stable-edit-draft", resolutionNo: "지결-2026-0255" });

    render(<ExpenseResolutionPage
      initialResolutionId={resolution.id}
      initialResolutions={[resolution]}
      loadFormOptions={vi.fn().mockRejectedValue(new Error("작성용 기준정보 조회 실패"))}
      viewer={{ active: true, display_name: "관리자", organization_id: "org", permissions: ["ADMIN"], user_id: "admin" }}
    />);

    const detail = await screen.findByRole("region", { name: "지출결의서 상세" });
    fireEvent.click(within(detail).getByRole("button", { name: "수정" }));
    await waitFor(() => expect(within(detail).getByText("작성용 기준정보 조회 실패")).toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "지출결의서 수정" })).not.toBeInTheDocument();
  });

  it("keeps only linked bank sources in an existing bank-backed edit form", () => {
    const candidates = Array.from({ length: 500 }, (_, index) => ({
      description: `통장거래 ${index + 1}`,
      id: `bank-${index + 1}`,
      resolutionStatus: "UNRESOLVED",
      transactedAt: "2026-10-31T09:00:00+09:00",
      withdrawalAmount: index + 1,
    }));

    expect(getEditBankTransactionCandidates(candidates, "resolution-1", {
      bankTransactionId: "bank-6",
      bankTransactions: [],
    })).toEqual([expect.objectContaining({ id: "bank-6" })]);
    expect(getEditBankTransactionCandidates(candidates, null, {
      bankTransactionId: "bank-6",
      bankTransactions: [],
    })).toHaveLength(500);
  });

  it("keeps a directly edited payment account when a resolution is saved and reopened", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    const firstRender = render(<ExpenseResolutionPage initialResolutions={[]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const createDialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.change(within(createDialog).getByLabelText("지급은행"), { target: { value: "기업은행" } });
    fireEvent.change(within(createDialog).getByLabelText("지급계좌번호"), { target: { value: "222-028736-02-019" } });
    fireEvent.change(within(createDialog).getByLabelText("예금주"), { target: { value: "오학동" } });

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
    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    fireEvent.click(within(screen.getByRole("region", { name: "지출결의서 상세" })).getByRole("button", { name: "수정" }));

    const editDialog = await getExpenseResolutionForm("지출결의서 수정");
    fireEvent.click(within(editDialog).getByRole("button", { name: "지급·거래" }));
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
    fireEvent.click(within(await getExpenseResolutionForm("지출결의서 작성")).getByRole("button", { name: "임시저장" }));

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

  it("shows a pending budget selection instead of a false budget overrun", async () => {
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));

    expect(within(dialog).getAllByText("예산항목 선택 필요").length).toBeGreaterThan(0);
    expect(within(dialog).queryByText("예산초과")).not.toBeInTheDocument();
  });

  it("restores local drafts only in the standalone form without a server source", async () => {
    const firstRender = render(<ExpenseResolutionPage />);
    act(() => vi.runOnlyPendingTimers());
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    fireEvent.click(within(await getExpenseResolutionForm("지출결의서 작성")).getByRole("button", { name: "임시저장" }));
    expect(localStorage.getItem("dbapt-erp:finance:expense-resolutions")).toContain("지결-2026-0001");
    firstRender.unmount();

    render(<ExpenseResolutionPage />);
    act(() => vi.runOnlyPendingTimers());
    expect(screen.getByText("지결-2026-0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체 결의서" })).toBeInTheDocument();
  });

  it("guides the author through payment, evidence, and approval review steps", async () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = await getExpenseResolutionForm("지출결의서 작성");
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

  it("opens the evidence file picker immediately when automatic input is selected", async () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, "click");
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.click(within(dialog).getByRole("button", { name: "증빙자료 자동입력" }));

    expect(inputClick).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByLabelText("증빙자료 자동입력 파일 선택")).toBeInTheDocument();
  });

  it("provides a corporate-card quick entry flow with missing-receipt reasons", async () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");

    fireEvent.click(within(dialog).getByRole("button", { name: "예산 내 간편지출" }));
    expect(within(dialog).getByRole("heading", { name: "예산 내 간편지출" })).toBeInTheDocument();
    expect(within(dialog).getByText("어떻게 결제했나요?")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "택시" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByLabelText("비용부담 유형")).toHaveValue("CORPORATE_CARD");
    expect(within(dialog).getByRole("button", { name: "카드 사용 임시등록" })).toBeInTheDocument();
    expect(within(dialog).getByText("카드 승인내역 연결대기")).toBeInTheDocument();
    expect(within(dialog).getByText("공용 법인카드 결제완료")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("지급은행")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("지급계좌번호")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "영수증 미발행" }));
    expect(within(dialog).getByLabelText("출력 증빙·대체증빙 설명")).toHaveValue("영수증 미발행 · 공용 법인카드 사용내역 확인 필요");
    expect(within(dialog).getByText(/결재권자의 추가 확인 대상/)).toBeInTheDocument();
  });

  it("does not persist a payment account for an already-paid corporate-card expense", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    render(<ExpenseResolutionPage initialResolutions={[]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");

    fireEvent.click(within(dialog).getByRole("button", { name: "예산 내 간편지출" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "카드 사용 임시등록" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledOnce());
    expect(persistResolution.mock.calls[0][0]).toMatchObject({
      accountHolder: "",
      expenseBurdenType: "CORPORATE_CARD",
      paymentAccountNo: "",
      paymentBank: "",
      paymentStatus: "지급완료",
    });
  });

  it("creates a taxi expense draft from an unresolved corporate-card transaction", async () => {
    render(<ExpenseResolutionPage initialCardTransactions={[{
      amount: 18500,
      approvalNo: "48392011",
      approvedAt: "2026-07-02T21:15:00+09:00",
      cardLastFour: "5521",
      cardName: "KB 공용 법인카드",
      category: "택시",
      id: "card-tx-1",
      merchantName: "카카오T",
    }]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");

    fireEvent.click(within(dialog).getByRole("button", { name: "예산 내 간편지출" }));
    fireEvent.change(within(dialog).getByLabelText("법인카드 승인내역"), { target: { value: "card-tx-1" } });

    expect(within(dialog).getByLabelText("실제 지출일")).toHaveValue("2026-07-02");
    expect(within(dialog).getByLabelText("건명 (필수)")).toHaveValue("7월 2일 업무용 택시비");
    expect(within(dialog).getByText(/택시 자동분류/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByLabelText("품목명 1")).toHaveValue("카카오T 택시비");
    expect(within(dialog).getByLabelText("단가 1")).toHaveValue(18500);
    expect(within(dialog).getByLabelText("출력 증빙·대체증빙 설명")).toHaveValue("공용 법인카드 승인내역으로 대체 · 승인번호 48392011");
  });

  it("creates a corporate debit-card draft from bank withdrawals without card transaction input", async () => {
    vi.useRealTimers();
    const persistResolution = vi.fn(async (resolution) => resolution);
    render(<ExpenseResolutionPage initialBankTransactions={[
      { counterparty: "옛골식당", description: "옛골식당", id: "bank-card-1", resolutionStatus: "UNRESOLVED", transactedAt: "2026-01-07T12:00:00+09:00", withdrawalAmount: 18000 },
      { counterparty: "옛골식당", description: "옛골식당", id: "bank-card-2", resolutionStatus: "UNRESOLVED", transactedAt: "2026-01-08T12:00:00+09:00", withdrawalAmount: 36000 },
    ]} initialResolutions={[]} persistResolution={persistResolution} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");

    fireEvent.click(within(dialog).getByRole("button", { name: "예산 내 간편지출" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "건별로 바로 출금 · 체크카드" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /2026-01-07 · 18,000원/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /2026-01-08 · 36,000원/ }));
    expect(within(dialog).getByText("통장 건별출금 2건 확인완료")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "임시저장" }));

    await waitFor(() => expect(persistResolution).toHaveBeenCalledWith(expect.objectContaining({
      bankTransactions: expect.arrayContaining([expect.objectContaining({ id: "bank-card-1" }), expect.objectContaining({ id: "bank-card-2" })]),
      cardReconciliationStatus: "MATCHED",
      cardSettlementMode: "BANK_DIRECT",
      cardTransactionId: undefined,
      cardVerificationSource: "BANK_TRANSACTION",
      expenseBurdenType: "CORPORATE_CARD",
      totalPaymentAmount: 54000,
    })));
  });

  it("connects a bank withdrawal through the budget-direct quick expense flow", async () => {
    render(<ExpenseResolutionPage initialBankTransactions={[{
      counterparty: "KT",
      description: "사무실 인터넷 요금",
      id: "bank-tx-1",
      resolutionStatus: "UNRESOLVED",
      transactedAt: "2026-08-27T09:00:00+09:00",
      withdrawalAmount: 55000,
    }]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");

    fireEvent.click(within(dialog).getByRole("button", { name: "예산 내 간편지출" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "계좌이체" }));
    fireEvent.change(within(dialog).getByLabelText("간편지출 통장 출금거래"), { target: { value: "bank-tx-1" } });

    expect(within(dialog).getByLabelText("실제 지출일")).toHaveValue("2026-08-27");
    expect(within(dialog).getByLabelText("거래처명")).toHaveValue("KT");
    expect(within(dialog).getByText("선택한 출금내역의 날짜·금액·거래처를 사용합니다.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    expect(within(dialog).getByLabelText("품목명 1")).toHaveValue("사무실 인터넷 요금");
    expect(within(dialog).getByLabelText("단가 1")).toHaveValue(55000);
  });

  it("shows fields that match the selected expense timing", async () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");

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

  it("calculates multiple single items and validates account allocations", async () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
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

  it("opens the existing resolution in edit mode from a print validation warning", async () => {
    render(<ExpenseResolutionPage />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    fireEvent.click(within(await getExpenseResolutionForm("지출결의서 작성")).getByRole("button", { name: "임시저장" }));

    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const detailDialog = screen.getByRole("region", { name: "지출결의서 상세" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(within(detailDialog).getByRole("menuitem", { name: "보관용 PDF 생성" }));

    const warningDialog = screen.getByRole("dialog", { name: "보관용 출력 전 확인" });
    expect(within(warningDialog).getByText(/거래처가 입력되지 않았습니다/)).toBeInTheDocument();
    fireEvent.click(within(warningDialog).getByRole("button", { name: "수정하기" }));

    const editDialog = await getExpenseResolutionForm("지출결의서 수정");
    fireEvent.click(within(editDialog).getByRole("button", { name: "지급·거래" }));
    expect(within(editDialog).getByLabelText("결의서번호")).toHaveValue("지결-2026-0001");
    fireEvent.change(within(editDialog).getByLabelText("거래처명"), { target: { value: "테스트 거래처" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: "수정사항 저장" }));

    expect(screen.getByRole("button", { name: "전체 결의서" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "지출결의서 상세" })).getByText("테스트 거래처")).toBeInTheDocument();
  });

  it("prints project identity and the detailed expense rows for a batch resolution", async () => {
    vi.useRealTimers();
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const createDialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.click(within(createDialog).getByRole("button", { name: "프로젝트 일괄 지출결의" }));
    expect(within(createDialog).getByRole("button", { name: "엑셀 일괄등록" })).toBeInTheDocument();
    fireEvent.change(within(createDialog).getByLabelText("프로젝트/사업과제"), { target: { value: "사무국 비품 구입" } });
    expect(within(createDialog).getByPlaceholderText("예: 정기총회 준비, 7월 사무실 비품구매")).toHaveValue("사무국 비품 구입");
    fireEvent.click(within(createDialog).getByRole("button", { name: "임시저장" }));

    fireEvent.click(screen.getByRole("button", { name: /상세보기$/ }));
    const detailDialog = await screen.findByRole("region", { name: "지출결의서 상세" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(within(detailDialog).getByRole("menuitem", { name: "A4 출력 미리보기" }));
    expect(screen.queryByRole("dialog", { name: "보관용 출력 전 확인" })).not.toBeInTheDocument();

    const printDialog = await screen.findByRole("dialog", { name: "지출결의서 출력 미리보기" });
    expect(printDialog.querySelector(".expense-resolution-print-page")).toHaveClass("expense-resolution-document-page");
    expect(within(printDialog).getByRole("heading", { name: "지출결의서" })).toHaveClass("text-[35px]");
    const coreInfoHeading = within(printDialog).getByRole("heading", { name: "핵심 결의정보" });
    expect(coreInfoHeading).toHaveClass("text-[15px]");
    expect(coreInfoHeading.nextElementSibling).toHaveClass("border-y", "border-solid", "border-[#9ca3af]");
    expect(coreInfoHeading.nextElementSibling).not.toHaveClass("border");
    const coreInfoTable = coreInfoHeading.nextElementSibling as HTMLElement;
    expect(within(coreInfoTable).getByText("거래처").parentElement).not.toHaveClass("col-span-2");
    expect(within(coreInfoTable).getByText("예산항목").parentElement).toHaveClass("border-r-0");
    expect(within(coreInfoTable).getByText("예산항목").parentElement).not.toHaveClass("col-span-2");
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
    expect(within(expenseItemsTable as HTMLTableElement).getByRole("columnheader", { name: "거래처" })).toHaveClass("px-1", "py-1", "text-[12px]");
    expect(within(expenseItemsTable as HTMLTableElement).getByRole("columnheader", { name: "거래처" })).toHaveClass("[border-bottom-style:dashed]");
    expect(expenseItemsTable?.querySelectorAll("col")).toHaveLength(6);
    expect(expenseItemsTable?.querySelectorAll("col")[1]).toHaveClass("w-[18%]");
    expect(expenseItemsTable?.querySelectorAll("col")[2]).toHaveClass("w-[34%]");
    expect(expenseItemsTable?.querySelector("tbody tr")).toHaveClass("text-center");
    expect(expenseItemsTable?.querySelectorAll("tbody tr")).toHaveLength(1);
    for (const cell of Array.from(expenseItemsTable?.querySelectorAll("tbody td:nth-child(n+4)") ?? [])) {
      expect(cell).toHaveClass("text-[12px]");
    }
    expect(expenseItemsTable?.querySelector("tbody tr[aria-hidden='true']")).not.toBeInTheDocument();
    expect(expenseItemsTable?.querySelector("thead")).toHaveClass("border-y", "border-solid", "border-[#9ca3af]");
    expect(expenseItemsTable?.querySelector("tfoot")).toHaveClass("border-y", "border-solid", "border-[#9ca3af]", "text-center");
    expect(within(printDialog).queryByRole("heading", { name: "예산 확인" })).not.toBeInTheDocument();
    const approvalHeading = within(printDialog).getByRole("heading", { name: "결재선" });
    const approvalTable = approvalHeading.closest("section")?.querySelector("table");
    expect(approvalTable).toHaveClass("ml-auto", "w-[219px]", "text-[13px]");
    expect(approvalTable?.querySelectorAll("col")).toHaveLength(4);
    expect(approvalTable?.querySelectorAll("col")[1]).toHaveClass("w-[67px]");
    expect(approvalTable?.querySelectorAll("col")[2]).toHaveClass("w-[67px]");
    expect(approvalTable?.querySelectorAll("col")[3]).toHaveClass("w-[67px]");
    const signatureCells = within(approvalTable as HTMLTableElement).getAllByText("서명란");
    expect(signatureCells).toHaveLength(2);
    expect(signatureCells[0].closest("td")).toHaveClass("h-[58px]", "px-0.5", "py-0.5");
    expect(approvalTable?.querySelector("td span:last-child")).toHaveClass("expense-approval-timestamp", "text-[9px]", "leading-tight", "tabular-nums");
    expect(within(approvalTable as HTMLTableElement).getByText("회계검토")).toBeInTheDocument();
    expect(within(approvalTable as HTMLTableElement).getByText("최종결재")).toBeInTheDocument();
    expect(within(approvalTable as HTMLTableElement).getByText("결").parentElement).toHaveStyle({ display: "inline-flex", flexDirection: "column", gap: "10px" });
    expect(within(printDialog).getByText("총 결의금액")).toHaveClass("text-[17px]", "font-bold");
    expect(within(printDialog).getByText("총 결의금액")).not.toHaveClass("text-[var(--color-stone)]");
    const evidenceHeading = within(printDialog).getByRole("heading", { name: "지출사유 및 증빙" });
    expect(evidenceHeading.nextElementSibling).toHaveClass("border-y", "border-solid", "border-[#9ca3af]");
    expect(evidenceHeading.nextElementSibling).not.toHaveClass("border");
    const evidenceLabel = within(printDialog).getByText("증빙·확인근거");
    expect(evidenceLabel).toHaveClass("text-[13px]");
    expect(evidenceLabel.nextElementSibling).toHaveClass("text-[13px]");
    expect(within(printDialog).getByText("작성자").parentElement).toHaveTextContent("작성자오학동");
    expect(within(printDialog).getByText("작성자")).toHaveClass("text-[13px]");
    expect(within(printDialog).getByText("작성자").parentElement?.lastElementChild).toHaveClass("text-[13px]", "text-[var(--color-stone)]");
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
    expect(within(printDialog).queryByText("사무용품 및 소모품 구입")).not.toBeInTheDocument();
  }, 10_000);

  it("imports valid Excel-compatible rows and reports invalid rows", async () => {
    vi.useRealTimers();
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByText("더보기"));
    fireEvent.click(screen.getByRole("button", { name: "엑셀 가져오기" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
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
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
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
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));

    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), {
      target: { files: [new File(["postal receipt"], "납입금 확인 2차 안내문 우편발송(260821).png", { type: "image/png" })] },
    });

    expect(await within(dialog).findByText(/추천 예산항목: 일반운영비>도서인쇄비/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("분할 예산항목 1")).toHaveValue("일반운영비>도서인쇄비");
    expect(within(dialog).getByText("2026-08")).toBeInTheDocument();
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
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
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
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.click(within(dialog).getByRole("button", { name: "증빙자료 자동입력" }));
    const file = new File(["합계 33,000원"], "카드영수증.png", { type: "image/png" });
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [file] } });

    expect(await within(dialog).findByText("카드영수증.png")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("단가 1")).toHaveValue(33000);
    expect(within(dialog).getByLabelText("부가세 1")).toHaveValue(0);
  });

  it("selects evidence OCR automatically for settlement expenses", async () => {
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.click(within(dialog).getByRole("button", { name: "이전에 받은 금액을 정산합니다" }));

    expect(within(dialog).getByRole("button", { name: "증빙자료 자동입력" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows upload and OCR progress while a PDF is being processed", async () => {
    vi.useRealTimers();
    let finishUpload!: (attachment: ExpenseEvidenceAttachment) => void;
    const uploadEvidence = vi.fn(() => new Promise<ExpenseEvidenceAttachment>((resolve) => { finishUpload = resolve; }));
    render(<ExpenseResolutionPage initialResolutions={[]} uploadEvidence={uploadEvidence} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
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
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
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
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
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
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    const file = new File(["image"], "실패영수증.jpg", { type: "image/jpeg" });
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [file] } });

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("증빙파일을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    expect(within(dialog).getByRole("alert")).not.toHaveTextContent("Server Components render");
  });

  it("moves to the matching field when a missing-field validation message is clicked", async () => {
    render(<ExpenseResolutionPage initialResolutions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.change(within(dialog).getByLabelText("기안 생략 사유"), { target: { value: "승인 예산 내 일상 지출" } });
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
    const dialog = await getExpenseResolutionForm("지출결의서 작성");
    fireEvent.click(within(dialog).getByRole("button", { name: "이미 결제한 비용을 신청합니다" }));
    fireEvent.change(within(dialog).getByLabelText("증빙자료 파일 선택"), { target: { files: [new File(["image"], "봉투구매.jpg", { type: "image/jpeg" })] } });

    expect(await within(dialog).findByText("OCR 자동입력이 완료되었습니다.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("거래처명")).toHaveValue("스마트기획");
    expect(within(dialog).getByLabelText("품목명 1")).toHaveValue("소봉투제작(5백매)");
    expect(within(dialog).getByLabelText("단가 1")).toHaveValue(60000);
    expect(within(dialog).getByLabelText("분할 계정과목 1")).toHaveValue("운영비");
    expect(within(dialog).getByLabelText("분할 예산항목 1")).toHaveValue("일반운영비>도서인쇄비");
    expect(within(dialog).getByText(/추천 예산항목: 일반운영비>도서인쇄비/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("분할 적요 1")).toHaveValue("소봉투제작(5백매)");
    expect(within(dialog).getByLabelText("증빙 유형")).toHaveValue("SIMPLE_RECEIPT");
    expect(within(dialog).getByLabelText("증빙 상태")).toHaveValue("GENERAL");

    fireEvent.click(within(dialog).getByRole("button", { name: "다음 단계" }));
    const subjectReviewRow = within(dialog).getByText("건명 입력").closest("div");
    expect(subjectReviewRow).not.toBeNull();
    expect(within(subjectReviewRow!).getByText("추천: 일반운영비>도서인쇄 구입")).toBeInTheDocument();
    fireEvent.click(within(subjectReviewRow!).getByRole("button", { name: "추천 적용" }));
    expect(within(dialog).getByText("건명 입력").closest("div")).toHaveClass("bg-[var(--color-sprout)]");
    const projectReviewRow = within(dialog).getByText("프로젝트 선택").closest("div");
    expect(within(projectReviewRow!).getByText("추천: 사무국 비품 구입")).toBeInTheDocument();
    const reasonReviewRow = within(dialog).getByText("지출사유 입력").closest("div");
    expect(within(reasonReviewRow!).getByText(/추천: 조합 운영에 필요한 소봉투제작/)).toBeInTheDocument();
  });
});
