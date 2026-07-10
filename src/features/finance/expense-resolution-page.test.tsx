import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createExpenseResolutionInternalId, ExpenseResolutionPage } from "./expense-resolution-page";

describe("ExpenseResolutionPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-03T09:00:00+09:00"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the expense resolution list without the static creation guide panel", () => {
    render(<ExpenseResolutionPage />);

    expect(screen.getByRole("heading", { name: "지출결의서 관리" })).toBeInTheDocument();
    expect(screen.getByText("회계/자금 > 전표·증빙관리 > 지출결의서 관리")).toBeInTheDocument();
    expect(screen.getByText("지출결의서 작성 → 승인요청 → 승인완료 → 지급대기 → 지급완료 → 지출전표 생성 → 증빙자료 연결")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지출결의 작성" })).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).queryByRole("columnheader", { name: "결의서번호" })).not.toBeInTheDocument();
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["작성일", "결의요약", "총지급액", "예산상태", "진행상태", "증빙", "액션"]);
    expect(within(table).getByText("결의요약")).toBeInTheDocument();
    expect(within(table).getByText("총지급액")).toBeInTheDocument();
    expect(within(table).getByText("예산상태")).toBeInTheDocument();
    expect(within(table).getByText("진행상태")).toBeInTheDocument();
    expect(within(table).getByText("증빙")).toBeInTheDocument();
    expect(within(table).getByText("액션")).toBeInTheDocument();
    for (const hiddenHeader of ["결의서유형", "프로젝트/사업과제", "작성자", "대표 거래처", "대표 계정항목", "항목수", "예산초과", "현재결재자", "승인상태", "지급상태", "전표번호", "증빙여부"]) {
      expect(within(table).queryByRole("columnheader", { name: hiddenHeader })).not.toBeInTheDocument();
    }
    expect(within(table).getByText("지결-2026-0001")).toBeInTheDocument();
    expect(within(table).getAllByText("단일 · 프로젝트 없음").length).toBeGreaterThan(0);
    expect(within(table).getByText("법무법인 ○○ / 법무비")).toBeInTheDocument();
    expect(within(table).getAllByText("승인대기 · 지급대기 · 미생성").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "전체 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "결재함 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지급대기 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지급완료 1" })).toBeInTheDocument();

    expect(screen.queryByRole("heading", { name: "작성 양식" })).not.toBeInTheDocument();
    expect(screen.queryByText("지출 전 결의서에 필요한 입력 항목입니다.")).not.toBeInTheDocument();
    expect(screen.queryByText("결의서번호 입력")).not.toBeInTheDocument();
    for (const option of ["운영비", "용역비", "토지매입비", "업무대행비", "법무비", "세무비", "감정평가비", "환불금", "차입금상환", "기타"]) {
      expect(screen.getAllByText(option).length).toBeGreaterThan(0);
    }
  });

  it("exports the full expense resolution list to an Excel-compatible CSV regardless of the active tab", async () => {
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:expense-resolution-export");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지급대기 1" }));
    fireEvent.click(screen.getByRole("button", { name: "엑셀" }));

    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    const exportedBlob = createObjectUrlSpy.mock.calls[0]?.[0] as Blob;
    const csv = await exportedBlob.text();

    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:expense-resolution-export");
    expect(exportedBlob.type).toBe("text/csv;charset=utf-8");
    expect(csv).toContain("결의서번호,결의서유형,프로젝트/사업과제,작성일,작성자,지출예정일,지급유형");
    expect(csv).toContain("지결-2026-0001");
    expect(csv).toContain("지결-2026-0005");
    expect(csv).toContain('"950,000,000원"');
    expect(csv.split("\n")).toHaveLength(6);
  });

  it("opens the creation modal from the header button and saves a draft resolution", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    expect(within(dialog).getByText("조합 지출 전에 결의서를 작성하고 결재 승인 후 지급대기 및 지출전표 생성으로 연결합니다.")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("지결-2026-0006")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("작성자")).toHaveValue("오학동 사무장");
    expect(within(dialog).getByText("결재선")).toBeInTheDocument();
    expect(within(dialog).getByText("장현제")).toBeInTheDocument();
    expect(within(dialog).getByText("오학동")).toBeInTheDocument();
    expect(within(dialog).getByText("안동연")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "지급유형" })).toBeInTheDocument();
    expect(within(dialog).getByText("운영비 > 임대료 · 2026년 07월 예산")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "지출정보 상세 수정" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox", { name: "지출구분" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("세금계산서 · 파일 미첨부")).toBeInTheDocument();
    expect(within(dialog).getByText("오학동 사무장 · 국민은행 ****6789")).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "증빙자료" }).closest("details")).not.toHaveAttribute("open");
    expect(within(dialog).getByRole("heading", { name: "이번 달 예산현황" })).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("작성일"), { target: { value: "2026-07-15" } });
    expect(within(dialog).getByLabelText("지출예정일")).toHaveValue("2026-07-15");
    fireEvent.click(within(dialog).getByRole("button", { name: "지출정보 상세 수정" }));
    expect(within(dialog).getByRole("option", { name: "운영비 > 임대료" })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole("combobox", { name: "예산항목" }), { target: { value: "운영비 > 임대료" } });
    fireEvent.change(within(dialog).getByLabelText("거래처명"), { target: { value: "대방법무사무소" } });
    fireEvent.change(within(dialog).getByLabelText("공급가액"), { target: { value: "1000000" } });
    fireEvent.change(within(dialog).getByLabelText("부가세"), { target: { value: "100000" } });

    expect(within(dialog).getAllByText("1,100,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("월 예산")).toBeInTheDocument();
    expect(within(dialog).getByText("1,300,000원")).toBeInTheDocument();
    expect(within(dialog).getByText("2025년(전기) 연간예산")).toBeInTheDocument();
    expect(within(dialog).getAllByText("15,600,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("2026년(당기) 연간예산")).toBeInTheDocument();
    expect(within(dialog).getByText("사무실 임차료 등")).toBeInTheDocument();
    expect(within(dialog).getByText("결의 후 잔여예산")).toBeInTheDocument();
    expect(within(dialog).getByText("200,000원")).toBeInTheDocument();
    expect(within(dialog).getByText("집행률 84.6%")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "임시저장" }));

    expect(screen.queryByRole("dialog", { name: "지출결의서 작성" })).not.toBeInTheDocument();
    const table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("지결-2026-0006")).toBeInTheDocument();
    expect(within(table).getByText("2026-07-15")).toBeInTheDocument();
    expect(within(table).getByText("대방법무사무소")).toBeInTheDocument();
    expect(within(table).getByText("1,100,000원")).toBeInTheDocument();
    expect(within(table).getAllByText("작성중").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("지급전").length).toBeGreaterThan(0);
  });

  it("places amount and resolution reason inside the basic information section", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    const basicSectionHeading = within(dialog).getByRole("heading", { name: "기본정보" });
    const paymentSectionHeading = within(dialog).getByRole("heading", { name: "지급정보" });
    const evidenceSectionHeading = within(dialog).getByRole("heading", { name: "증빙자료" });
    const basicSection = basicSectionHeading.closest("section");

    expect(basicSectionHeading.compareDocumentPosition(paymentSectionHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(basicSectionHeading.compareDocumentPosition(evidenceSectionHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(basicSection).not.toBeNull();
    expect(within(basicSection as HTMLElement).getByText("결의 입력")).toBeInTheDocument();
    expect(within(basicSection as HTMLElement).getByLabelText("공급가액")).toBeInTheDocument();
    expect(within(basicSection as HTMLElement).getByLabelText("부가세")).toBeInTheDocument();
    expect(within(basicSection as HTMLElement).getByText("총지급액")).toBeInTheDocument();
    expect(within(basicSection as HTMLElement).getByLabelText("지출사유")).toBeInTheDocument();
    expect(within(dialog).queryByRole("heading", { name: "결의 핵심정보" })).not.toBeInTheDocument();
  });

  it("collapses evidence, payment, and memo sections below the basic information section", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    const evidenceHeading = within(dialog).getByRole("heading", { name: "증빙자료" });
    const paymentHeading = within(dialog).getByRole("heading", { name: "지급정보" });
    const memoHeading = within(dialog).getByRole("heading", { name: "기타" });
    const evidenceDetails = evidenceHeading.closest("details");
    const paymentDetails = paymentHeading.closest("details");
    const memoDetails = memoHeading.closest("details");

    expect(evidenceHeading.compareDocumentPosition(paymentHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(paymentHeading.compareDocumentPosition(memoHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(evidenceDetails).not.toBeNull();
    expect(paymentDetails).not.toBeNull();
    expect(memoDetails).not.toBeNull();
    expect(evidenceDetails).not.toHaveAttribute("open");
    expect(paymentDetails).not.toHaveAttribute("open");
    expect(memoDetails).not.toHaveAttribute("open");
    expect(within(evidenceDetails as HTMLElement).getByText("세금계산서 · 파일 미첨부")).toBeInTheDocument();
    expect(within(paymentDetails as HTMLElement).getByText("오학동 사무장 · 국민은행 ****6789")).toBeInTheDocument();
    expect(within(memoDetails as HTMLElement).getByText("내부메모 없음")).toBeInTheDocument();

    fireEvent.click(evidenceHeading);
    fireEvent.click(paymentHeading);
    fireEvent.click(memoHeading);

    expect(evidenceDetails).toHaveAttribute("open");
    expect(paymentDetails).toHaveAttribute("open");
    expect(memoDetails).toHaveAttribute("open");
    expect(within(evidenceDetails as HTMLElement).getByRole("combobox", { name: "증빙유형" })).toBeInTheDocument();
    expect(within(paymentDetails as HTMLElement).getByRole("combobox", { name: "지급대상" })).toBeInTheDocument();
    expect(within(memoDetails as HTMLElement).getByLabelText("내부메모")).toBeInTheDocument();
  });

  it("uses the current date, year-based next resolution number, and login author guidance", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    expect(within(dialog).getByDisplayValue("지결-2026-0006")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("작성일")).toHaveValue("2026-07-03");
    expect(within(dialog).getByLabelText("지출예정일")).toHaveValue("2026-07-03");
    expect(within(dialog).getByLabelText("작성자")).toHaveValue("오학동 사무장");
    expect(within(dialog).getByText("작성자는 로그인 사용자 기준으로 자동 입력되며 결재선과 별도로 관리됩니다.")).toBeInTheDocument();

    expect(within(dialog).getByText("작성일")).toHaveClass("text-xs", "text-[var(--color-stone)]");
    expect(within(dialog).getByLabelText("작성일")).toHaveClass("text-base", "font-bold", "text-[var(--color-midnight-ink)]");
    expect(within(dialog).getByLabelText("결의서번호")).toHaveClass("bg-[var(--color-cloud-veil)]", "text-[var(--color-deep-cobalt)]");
  });

  it("starts resolution numbering from one when the current year changes", () => {
    vi.setSystemTime(new Date("2027-01-02T09:00:00+09:00"));

    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    expect(within(dialog).getByDisplayValue("지결-2027-0001")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("작성일")).toHaveValue("2027-01-02");
    expect(within(dialog).getByLabelText("지출예정일")).toHaveValue("2027-01-02");
  });

  it("keeps internal ids separate from visible resolution numbers", () => {
    expect(createExpenseResolutionInternalId("지결-2026-0006")).toBe("er_2026_0006");
  });

  it("applies project presets to single and batch expense information", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "프로젝트/사업과제" }), { target: { value: "사무국 비품 구입" } });

    expect(within(dialog).getByText("운영비 > 사무용품비 · 2026년 07월 예산")).toBeInTheDocument();
    expect(within(dialog).getByText("증빙 권장: 영수증")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "지출정보 상세 수정" }));
    expect(within(dialog).getByRole("combobox", { name: "지출구분" })).toHaveValue("운영비");
    expect(within(dialog).getByRole("combobox", { name: "운영비 세부구분" })).toHaveValue("사무용품비");
    expect(within(dialog).getByRole("combobox", { name: "예산항목" })).toHaveValue("운영비 > 사무용품비");
    fireEvent.click(within(dialog).getByRole("heading", { name: "증빙자료" }));
    expect(within(dialog).getByRole("combobox", { name: "증빙유형" })).toHaveValue("영수증");
    expect(within(dialog).getByText("사무국 비품 구입 기준 추천값이 적용되었습니다.")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "결의서 유형" }), { target: { value: "BATCH" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "프로젝트/사업과제" }), { target: { value: "홈페이지·ERP 구축" } });

    expect(within(dialog).getByLabelText("1행 계정항목")).toHaveValue("ERP개발비");
    expect(within(dialog).getByLabelText("1행 예산항목")).toHaveValue("운영비 > 지급수수료");
    expect(within(dialog).getByLabelText("2행 계정항목")).toHaveValue("홈페이지관리비");
    expect(within(dialog).getByLabelText("2행 증빙유형")).toHaveValue("세금계산서");
    expect(within(dialog).getByText("홈페이지·ERP 구축 기준 추천값이 적용되었습니다.")).toBeInTheDocument();
  });

  it("supports advance payment settlement fields for already-paid operating expenses", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "지급유형" }), { target: { value: "선지급" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "지출정보 상세 수정" }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "지출구분" }), { target: { value: "운영비" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "운영비 세부구분" }), { target: { value: "소모품비" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "예산항목" }), { target: { value: "운영비 > 사무용품비" } });
    fireEvent.change(within(dialog).getByLabelText("거래처명"), { target: { value: "대방사무용품" } });
    fireEvent.change(within(dialog).getByLabelText("공급가액"), { target: { value: "120000" } });
    fireEvent.change(within(dialog).getByLabelText("부가세"), { target: { value: "12000" } });

    expect(within(dialog).getByText("선지급/사후정산 정보")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("선지급일")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("선지급자")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox", { name: "선지급 방법" })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("선지급 금액"), { target: { value: "132000" } });
    fireEvent.change(within(dialog).getByLabelText("실제 사용금액"), { target: { value: "132000" } });
    fireEvent.change(within(dialog).getByLabelText("사후승인 사유"), { target: { value: "긴급 사무용품 구매 후 정산" } });
    expect(within(dialog).getByText("차액 0원")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "승인요청" }));

    const table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("대방사무용품")).toBeInTheDocument();
    expect(within(table).getAllByText("지급완료").length).toBeGreaterThan(0);
  });

  it("loads payment information from staff, vendor, and member master data", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("heading", { name: "지급정보" }));
    expect(within(dialog).getByRole("combobox", { name: "지급대상" })).toHaveValue("staff-oh");
    expect(within(dialog).getByText("직원 기본정보")).toBeInTheDocument();
    expect(within(dialog).getByText("국민은행 ****6789 · 예금주 오학동")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("국민은행")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("110-123-456789")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "지급대상" }), { target: { value: "vendor-office" } });
    expect(within(dialog).getByText("업체 기본정보")).toBeInTheDocument();
    expect(within(dialog).getByText("우리은행 ****4555 · 예금주 대방사무용품")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("우리은행")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("1002-333-444555")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("combobox", { name: "지급대상" }), { target: { value: "member-refund" } });
    expect(within(dialog).getByText("조합원 환불계좌")).toBeInTheDocument();
    expect(within(dialog).getByText("신한은행 ****4321 · 예금주 박서연")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("신한은행")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("110-987-654321")).toBeInTheDocument();
  });

  it("creates a project batch expense resolution with item-level accounts, budgets, and over-budget summary", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    expect(within(dialog).getByRole("combobox", { name: "결의서 유형" })).toHaveValue("SINGLE");
    fireEvent.change(within(dialog).getByRole("combobox", { name: "결의서 유형" }), { target: { value: "BATCH" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "프로젝트/사업과제" }), { target: { value: "2026년 정기총회 준비" } });

    expect(within(dialog).queryByRole("table", { name: "세부 지출내역" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "1행 세부 지출항목" })).toBeInTheDocument();
    expect(within(dialog).getByRole("group", { name: "2행 세부 지출항목" })).toBeInTheDocument();
    expect(within(dialog).getByText("일괄 지출결의의 총지급액은 세부 지출내역 합계로 자동 계산됩니다.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("1행 거래처")).toHaveValue("대방컨벤션센터");
    expect(within(dialog).getByLabelText("1행 계정항목")).toHaveValue("총회대관료");
    expect(within(dialog).getByLabelText("2행 계정항목")).toHaveValue("인쇄비");
    expect(within(dialog).getByLabelText("1행 예산항목")).toHaveValue("총회비 > 대관료");
    expect(within(dialog).getByLabelText("2행 예산항목")).toHaveValue("총회비 > 인쇄비");
    expect(within(dialog).getAllByText("4,700,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("예산초과 항목 포함")).toBeInTheDocument();
    expect(within(dialog).getByText("예산초과 1건")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "1행 행 복사" }));
    expect(within(dialog).getByLabelText("3행 계정항목")).toHaveValue("총회대관료");
    fireEvent.click(within(dialog).getByRole("button", { name: "3행 행 삭제" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "2행 증빙첨부" }));
    expect(within(dialog).getByDisplayValue("증빙첨부-ui-2.pdf")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "승인요청" }));

    const table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("결의요약")).toBeInTheDocument();
    expect(within(table).getByText("예산상태")).toBeInTheDocument();
    expect(within(table).getByText("진행상태")).toBeInTheDocument();
    expect(within(table).getByText("지결-2026-0006")).toBeInTheDocument();
    expect(within(table).getByText("일괄")).toBeInTheDocument();
    expect(within(table).getByText("2026년 정기총회 준비")).toBeInTheDocument();
    expect(within(table).getByText("다수 거래처")).toBeInTheDocument();
    expect(within(table).getByText("복합계정")).toBeInTheDocument();
    expect(within(table).getByText("예산초과 1건")).toBeInTheDocument();

    const createdRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0006"));
    expect(createdRow).toBeDefined();
    fireEvent.click(within(createdRow as HTMLElement).getByRole("button", { name: "상세보기" }));

    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(detailDialog).getByRole("heading", { name: "프로젝트 일괄 지출결의 요약" })).toBeInTheDocument();
    expect(within(detailDialog).getAllByText("프로젝트 일괄 지출결의").length).toBeGreaterThan(0);
    expect(within(detailDialog).getByText("총회책자 인쇄")).toBeInTheDocument();
    expect(within(detailDialog).getByText("총회비 > 인쇄비")).toBeInTheDocument();
    expect(within(detailDialog).getByText("예산초과 1건")).toBeInTheDocument();
  });

  it("approves a batch resolution once, auto-drafts expense vouchers, supports item payments, and confirms vouchers", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    let dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "결의서 유형" }), { target: { value: "BATCH" } });
    fireEvent.change(within(dialog).getByRole("combobox", { name: "프로젝트/사업과제" }), { target: { value: "2026년 정기총회 준비" } });
    expect(within(dialog).getByRole("combobox", { name: "지급처리 방식" })).toHaveValue("ITEM");
    expect(within(dialog).getByRole("combobox", { name: "전표 생성 방식" })).toHaveValue("ITEM_VOUCHER");
    fireEvent.click(within(dialog).getByRole("button", { name: "승인요청" }));

    const createdRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0006"));
    expect(createdRow).toBeDefined();
    fireEvent.click(within(createdRow as HTMLElement).getByRole("button", { name: "상세보기" }));

    dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(dialog).getByText("장현제 부장")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "승인" }));
    dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(dialog).getAllByText("오학동 사무장").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "승인" }));
    dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(dialog).getAllByText("안동연 조합장").length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "승인" }));
    dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(dialog).getAllByText("승인완료").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("지급대기").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("시스템 · 지급대기 전환")).toBeInTheDocument();
    expect(within(dialog).getAllByText("지출-2026-0002-01").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("지출-2026-0002-02")).toBeInTheDocument();
    expect(within(dialog).getByText("시스템 · 지출전표 초안 생성")).toBeInTheDocument();
    expect(within(dialog).getAllByText("전표초안").length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "지급처리" }));
    const paymentDialog = screen.getByRole("dialog", { name: "지급처리" });
    expect(within(paymentDialog).getByRole("combobox", { name: "지급처리 방식" })).toHaveValue("ITEM");
    fireEvent.change(within(paymentDialog).getByLabelText("지급메모"), { target: { value: "1차 항목 지급" } });
    fireEvent.click(within(paymentDialog).getByRole("button", { name: "1행 지급완료 처리" }));

    fireEvent.click(screen.getByRole("button", { name: "부분지급 1" }));
    let table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("지결-2026-0006")).toBeInTheDocument();

    const partialRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0006"));
    expect(partialRow).toBeDefined();
    fireEvent.click(within(partialRow as HTMLElement).getByRole("button", { name: "지급처리" }));
    const secondPaymentDialog = screen.getByRole("dialog", { name: "지급처리" });
    fireEvent.click(within(secondPaymentDialog).getByRole("button", { name: "2행 지급완료 처리" }));

    fireEvent.click(screen.getByRole("button", { name: "지급완료 2" }));
    table = screen.getByRole("table", { name: "지출결의서 목록" });
    const paidBatchRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0006"));
    expect(paidBatchRow).toBeDefined();
    expect(within(paidBatchRow as HTMLElement).getByText("전표초안")).toBeInTheDocument();
    fireEvent.click(within(paidBatchRow as HTMLElement).getByRole("button", { name: "전표확정" }));
    expect(within(paidBatchRow as HTMLElement).getByText("전표확정")).toBeInTheDocument();

    fireEvent.click(within(paidBatchRow as HTMLElement).getByRole("button", { name: "상세보기" }));
    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(detailDialog).getAllByText("지출-2026-0002-01").length).toBeGreaterThan(0);
    expect(within(detailDialog).getByText("지출-2026-0002-02")).toBeInTheDocument();
    expect(within(detailDialog).getAllByText("전표확정").length).toBeGreaterThan(0);
    expect(within(detailDialog).getByText("오학동 사무장 · 지출전표 확정")).toBeInTheDocument();
  });

  it("rejects a resolution through a required rejection reason modal", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "결재함 2" }));
    const table = screen.getByRole("table", { name: "지출결의서 목록" });
    const targetRow = within(table).getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0002"));
    expect(targetRow).toBeDefined();
    fireEvent.click(within(targetRow as HTMLElement).getByRole("button", { name: "반려" }));

    const rejectDialog = screen.getByRole("dialog", { name: "반려사유 입력" });
    fireEvent.click(within(rejectDialog).getByRole("button", { name: "반려 처리" }));
    expect(within(rejectDialog).getByText("반려사유를 입력해주세요.")).toBeInTheDocument();
    fireEvent.change(within(rejectDialog).getByLabelText("반려사유"), { target: { value: "예산 항목 재확인 필요" } });
    fireEvent.click(within(rejectDialog).getByRole("button", { name: "반려 처리" }));

    fireEvent.click(screen.getByRole("button", { name: "반려함 1" }));
    expect(within(screen.getByRole("table", { name: "지출결의서 목록" })).getByText("예산 항목 재확인 필요")).toBeInTheDocument();
  });

  it("opens the same creation modal from the quick menu and submits for approval", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "퀵메뉴 지출결의 작성" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.click(within(dialog).getByRole("button", { name: "지출정보 상세 수정" }));
    fireEvent.change(within(dialog).getByLabelText("거래처명"), { target: { value: "미래세무회계" } });
    fireEvent.change(within(dialog).getByLabelText("공급가액"), { target: { value: "3000000" } });
    fireEvent.change(within(dialog).getByLabelText("부가세"), { target: { value: "300000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "승인요청" }));

    const table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("미래세무회계")).toBeInTheDocument();
    expect(within(table).getAllByText("장현제 부장").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("승인대기").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("지급전").length).toBeGreaterThan(0);

    const createdRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0006"));
    expect(createdRow).toBeDefined();
    fireEvent.click(within(createdRow as HTMLElement).getByRole("button", { name: "상세보기" }));

    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(detailDialog).getByText("오학동 사무장 · 지출결의서 작성")).toBeInTheDocument();
    expect(within(detailDialog).getByText("오학동 사무장 · 승인요청")).toBeInTheDocument();
  });

  it("filters resolution tabs and confirms drafted vouchers from the paid tab", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "결재함 2" }));
    let table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("지결-2026-0001")).toBeInTheDocument();
    expect(within(table).getByText("지결-2026-0002")).toBeInTheDocument();
    expect(within(table).queryByText("지결-2026-0003")).not.toBeInTheDocument();
    expect(within(table).getAllByRole("button", { name: "승인" }).length).toBe(2);

    const rejectionRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0002"));
    expect(rejectionRow).toBeDefined();
    fireEvent.click(within(rejectionRow as HTMLElement).getByRole("button", { name: "반려" }));
    const rejectionDialog = screen.getByRole("dialog", { name: "반려사유 입력" });
    fireEvent.change(within(rejectionDialog).getByLabelText("반려사유"), { target: { value: "예산 항목 재확인 필요" } });
    fireEvent.click(within(rejectionDialog).getByRole("button", { name: "반려 처리" }));
    fireEvent.click(screen.getByRole("button", { name: "반려함 1" }));
    table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("지결-2026-0002")).toBeInTheDocument();
    expect(within(table).getByText("예산 항목 재확인 필요")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "지급대기 1" }));
    table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("지결-2026-0003")).toBeInTheDocument();
    fireEvent.click(within(table).getByRole("button", { name: "지급처리" }));

    const paymentDialog = screen.getByRole("dialog", { name: "지급처리" });
    expect(within(paymentDialog).getByDisplayValue("지결-2026-0003")).toBeInTheDocument();
    expect(within(paymentDialog).getAllByDisplayValue("미래감정평가법인").length).toBeGreaterThan(0);
    expect(within(paymentDialog).getByText("이체확인증 첨부")).toBeInTheDocument();
    fireEvent.change(within(paymentDialog).getByLabelText("지급메모"), { target: { value: "운영계좌 이체 완료" } });
    fireEvent.click(within(paymentDialog).getByRole("button", { name: "지급완료 처리" }));
    expect(screen.queryByRole("dialog", { name: "지급처리" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "지급완료 2" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "지급완료 2" }));
    table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("지결-2026-0003")).toBeInTheDocument();
    const completedPaymentRow = within(table).getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0003"));
    expect(completedPaymentRow).toBeDefined();
    fireEvent.click(within(completedPaymentRow as HTMLElement).getByRole("button", { name: "상세보기" }));
    const completedPaymentDetail = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(completedPaymentDetail).getByText("오학동 사무장 · 지급완료")).toBeInTheDocument();
    expect(within(completedPaymentDetail).getByText("운영계좌 이체 완료")).toBeInTheDocument();
    fireEvent.click(within(completedPaymentDetail).getByRole("button", { name: "닫기" }));

    const paidRow = within(table).getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0004"));
    expect(paidRow).toBeDefined();
    fireEvent.click(within(paidRow as HTMLElement).getByRole("button", { name: "전표확정" }));
    expect(within(paidRow as HTMLElement).getByText("전표확정")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "전표생성완료 1" }));
    table = screen.getByRole("table", { name: "지출결의서 목록" });
    expect(within(table).getByText("지결-2026-0004")).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "전표보기" })).toBeInTheDocument();
  });

  it("opens the expense resolution detail modal from the list", () => {
    render(<ExpenseResolutionPage />);

    const targetRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0001"));
    expect(targetRow).toBeDefined();
    fireEvent.click(within(targetRow as HTMLElement).getByRole("button", { name: "상세보기" }));

    const dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(dialog).getByText("지출결의서의 결의 내용, 결재 진행상태, 증빙자료, 지급정보, 처리이력을 확인합니다.")).toBeInTheDocument();

    for (const section of ["기본정보", "지출정보", "지급정보", "연결정보", "결재선", "증빙자료", "처리이력"]) {
      expect(within(dialog).getByRole("heading", { name: section })).toBeInTheDocument();
    }
    expect(within(dialog).getByRole("heading", { name: "예산반영" })).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "출력보관" })).toBeInTheDocument();

    expect(within(dialog).getByText("지결-2026-0001")).toBeInTheDocument();
    expect(within(dialog).getAllByText("법무법인 ○○").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("3,300,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("승인대기").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("지급대기").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("오학동 사무장").length).toBeGreaterThan(0);

    for (const column of ["순서", "결재자", "직책", "결재상태", "처리일", "의견"]) {
      expect(within(dialog).getByText(column)).toBeInTheDocument();
    }
    expect(within(dialog).getByText("장현제")).toBeInTheDocument();
    expect(within(dialog).getByText("오학동")).toBeInTheDocument();
    expect(within(dialog).getByText("안동연")).toBeInTheDocument();

    for (const column of ["증빙유형", "파일명", "발행처", "금액", "첨부일"]) {
      expect(within(dialog).getByText(column)).toBeInTheDocument();
    }
    expect(within(dialog).getAllByText("보기").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("세금계산서").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("2026-07-02 10:30")).toBeInTheDocument();
    expect(within(dialog).getByText("오학동 사무장 · 지출결의서 작성")).toBeInTheDocument();
    expect(within(dialog).getByText("오학동 사무장 · 승인요청")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "오래된순" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "최신순" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "승인" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "반려" })).toBeInTheDocument();
    const printMenuButton = within(dialog).getByRole("button", { name: "인쇄하기" });
    expect(printMenuButton).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "출력 미리보기" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "보관용 PDF 생성" })).not.toBeInTheDocument();
    fireEvent.click(printMenuButton);
    expect(within(dialog).getByRole("menuitem", { name: "A4 출력 미리보기" })).toBeInTheDocument();
    expect(within(dialog).getByRole("menuitem", { name: "보관용 PDF 생성" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog", { name: "지출결의서 상세" })).not.toBeInTheDocument();
  });

  it("records print and archive history from the detail modal", () => {
    render(<ExpenseResolutionPage />);

    const targetRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0004"));
    expect(targetRow).toBeDefined();
    fireEvent.click(within(targetRow as HTMLElement).getByRole("button", { name: "상세보기" }));

    let dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    fireEvent.click(within(dialog).getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(within(dialog).getByRole("menuitem", { name: "보관용 PDF 생성" }));

    const warningDialog = screen.getByRole("dialog", { name: "보관용 출력 전 확인" });
    fireEvent.click(within(warningDialog).getByRole("button", { name: "그래도 출력하기" }));

    dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(dialog).getByText("출력번호")).toBeInTheDocument();
    expect(within(dialog).getByText("PRINT-2026-0001")).toBeInTheDocument();
    expect(within(dialog).getByText("2026년 세무비 지출결의서 / 6월 / 001")).toBeInTheDocument();
    expect(within(dialog).getByText("오학동 사무장 · 보관용 PDF 생성")).toBeInTheDocument();
  });

  it("opens a printable archive preview from the detail modal", () => {
    render(<ExpenseResolutionPage />);

    const targetRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0001"));
    expect(targetRow).toBeDefined();
    fireEvent.click(within(targetRow as HTMLElement).getByRole("button", { name: "상세보기" }));

    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(within(detailDialog).getByRole("menuitem", { name: "A4 출력 미리보기" }));

    const printDialog = screen.getByRole("dialog", { name: "지출결의서 출력 미리보기" });
    expect(within(printDialog).getByRole("heading", { name: "지출결의서" })).toBeInTheDocument();
    expect(within(printDialog).getByText("A4 세로 기준 보관용 문서 형태를 확인합니다.")).toBeInTheDocument();
    expect(printDialog.querySelector(".expense-resolution-print-page")).toHaveClass("erp-print-page");
    expect(within(printDialog).getByText("지결-2026-0001")).toBeInTheDocument();
    expect(within(printDialog).getByText("법무법인 ○○")).toBeInTheDocument();
    expect(within(printDialog).getByText("결의 기본정보")).toBeInTheDocument();
    expect(within(printDialog).getByText("예산 확인")).toBeInTheDocument();
    expect(within(printDialog).queryByText("예산반영")).not.toBeInTheDocument();
    expect(within(printDialog).queryByText("2025년(전기) 연간예산")).not.toBeInTheDocument();
    expect(within(printDialog).queryByText("2026년(당기) 연간예산")).not.toBeInTheDocument();
    expect(within(printDialog).getByText("내역 및 산출근거")).toBeInTheDocument();
    expect(within(printDialog).getByText("기집행액")).toBeInTheDocument();
    expect(within(printDialog).getByText("이번 결의금액")).toBeInTheDocument();
    expect(within(printDialog).getByText("집행상태")).toBeInTheDocument();
    expect(within(printDialog).getByText("결재선")).toBeInTheDocument();
    expect(within(printDialog).getByText("출력 및 보관정보")).toBeInTheDocument();
    expect(within(printDialog).getByText("출력일시")).toBeInTheDocument();
    expect(within(printDialog).getByText("부장")).toBeInTheDocument();
    expect(within(printDialog).getByText("장현제")).toBeInTheDocument();
    expect(within(printDialog).getByRole("button", { name: "브라우저 프린트" })).toBeInTheDocument();
  });

  it("warns before archive printing when the resolution is not ready for paper storage", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "지출결의 작성" }));
    const createDialog = screen.getByRole("dialog", { name: "지출결의서 작성" });
    fireEvent.change(within(createDialog).getByLabelText("공급가액"), { target: { value: "3423422" } });
    fireEvent.change(within(createDialog).getByLabelText("부가세"), { target: { value: "0" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: "임시저장" }));

    const createdRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0006"));
    expect(createdRow).toBeDefined();
    fireEvent.click(within(createdRow as HTMLElement).getByRole("button", { name: "상세보기" }));

    const detailDialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    fireEvent.click(within(detailDialog).getByRole("button", { name: "인쇄하기" }));
    fireEvent.click(within(detailDialog).getByRole("menuitem", { name: "A4 출력 미리보기" }));

    const warningDialog = screen.getByRole("dialog", { name: "보관용 출력 전 확인" });
    expect(within(warningDialog).getByText("보관용 출력 전 확인이 필요합니다.")).toBeInTheDocument();
    expect(within(warningDialog).getByText("거래처가 입력되지 않았습니다. 보관용 출력 전 거래처 정보를 확인해주세요.")).toBeInTheDocument();
    expect(within(warningDialog).getByText("지출사유가 너무 짧습니다. 보관용 문서에는 구체적인 지출사유를 입력해주세요.")).toBeInTheDocument();
    expect(within(warningDialog).getByText("예산을 초과한 지출결의입니다. 초과사유를 입력한 후 보관용 출력하는 것을 권장합니다.")).toBeInTheDocument();
    expect(within(warningDialog).getByRole("button", { name: "수정하기" })).toBeInTheDocument();
    fireEvent.click(within(warningDialog).getByRole("button", { name: "그래도 출력하기" }));

    const printDialog = screen.getByRole("dialog", { name: "지출결의서 출력 미리보기" });
    expect(within(printDialog).getAllByText("예산초과").length).toBeGreaterThan(0);
    expect(within(printDialog).getByText("예산초과 사유 미입력")).toBeInTheDocument();
    expect(within(printDialog).getByText("지출사유 미입력")).toBeInTheDocument();
    expect(within(printDialog).getByText("거래처 미입력")).toBeInTheDocument();
  });

  it("opens a printable operating expense budget table with monthly and quarterly details", () => {
    render(<ExpenseResolutionPage />);

    fireEvent.click(screen.getByRole("button", { name: "운영비 예산표 출력" }));

    const dialog = screen.getByRole("dialog", { name: "운영비 예산표 출력" });
    expect(within(dialog).getByRole("heading", { name: "2026년 운영비 예산표" })).toBeInTheDocument();
    expect(within(dialog).getByText("당기: 2026/01/01 ~ 2026/12/31")).toBeInTheDocument();
    expect(within(dialog).getByText("전기: 2025/01/01 ~ 2025/12/31")).toBeInTheDocument();
    expect(within(dialog).getByText("운영비 월별·분기별 내역")).toBeInTheDocument();
    expect(within(dialog).getByText("임대료")).toBeInTheDocument();
    expect(within(dialog).getAllByText("1,300,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("3,900,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText("15,600,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("사무실 임차료 등")).toBeInTheDocument();
    expect(within(dialog).getByText("소계")).toBeInTheDocument();
    expect(within(dialog).getAllByText("48,600,000원").length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: "브라우저 프린트" })).toBeInTheDocument();
  });

  it("shows state-specific detail actions", () => {
    render(<ExpenseResolutionPage />);

    const paidRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0004"));
    expect(paidRow).toBeDefined();
    fireEvent.click(within(paidRow as HTMLElement).getByRole("button", { name: "상세보기" }));

    let dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(dialog).getByRole("button", { name: "전표확정" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));

    const draftRow = screen.getAllByRole("row").find((row) => within(row).queryByText("지결-2026-0005"));
    expect(draftRow).toBeDefined();
    fireEvent.click(within(draftRow as HTMLElement).getByRole("button", { name: "상세보기" }));

    dialog = screen.getByRole("dialog", { name: "지출결의서 상세" });
    expect(within(dialog).getByRole("button", { name: "수정" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "승인요청" })).toBeInTheDocument();
  });
});
