import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BusinessPartnerPage } from "./business-partner-page";

describe("BusinessPartnerPage", () => {
  it("renders the basic info partner registration workflow", () => {
    render(<BusinessPartnerPage />);

    expect(screen.getByRole("heading", { name: "거래처 관리" })).toBeInTheDocument();
    expect(screen.getByText("세금계산서 및 채권/채무 관리를 위한 거래처 정보를 등록합니다.")).toBeInTheDocument();
    expect(screen.getByText("회계/자금 > 기초정보 > 거래처등록 > 유형선택 > 건별등록/엑셀 일괄등록")).toBeInTheDocument();
    expect(screen.getAllByText("거래처등록").length).toBeGreaterThan(0);
    expect(screen.getAllByText("품목등록").length).toBeGreaterThan(0);
    expect(screen.getAllByText("은행통장 등록").length).toBeGreaterThan(0);
    expect(screen.getByText("조합 신탁계좌, 운영계좌, 토지비 계좌 등 계좌 기본정보를 등록합니다.")).toBeInTheDocument();
    expect(screen.getAllByText("신용카드 등록").length).toBeGreaterThan(0);
    expect(screen.getByText("법인카드, 업무대행 카드 등 카드 기본정보와 인증정보를 등록합니다.")).toBeInTheDocument();
    expect(screen.getByText("유형선택")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "건별등록" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "엑셀 일괄등록" })).toBeInTheDocument();
    expect(screen.getByText("채권")).toBeInTheDocument();
    expect(screen.getAllByText("채무").length).toBeGreaterThan(0);
    expect(screen.getByText("대한토지신탁")).toBeInTheDocument();
  });

  it("registers a business partner through the configured server action", async () => {
    const createBusinessPartner = vi.fn(async (input) => ({ ...input, balanceAmount: 0, code: "BP-1000", evidenceProfileStatus: "완료" as const, id: "partner-db-1", registrationSource: "직접등록" as const }));
    render(<BusinessPartnerPage createBusinessPartner={createBusinessPartner} initialBusinessPartners={[]} initialSection="partners" />);
    fireEvent.click(screen.getByRole("button", { name: "건별등록" }));
    fireEvent.change(screen.getByLabelText("거래처명"), { target: { value: "신규 거래처" } });
    fireEvent.change(screen.getByLabelText("사업자등록번호"), { target: { value: "123-45-67890" } });
    fireEvent.change(screen.getByLabelText("대표자"), { target: { value: "홍길동" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("신규 거래처")).toBeInTheDocument();
    expect(createBusinessPartner).toHaveBeenCalledOnce();
  });

  it("loads an existing business partner into the edit form and saves the changes", async () => {
    const partner = {
      address: "서울 동작구",
      balanceAmount: 0,
      balanceType: "채무" as const,
      businessCategory: "미입력",
      businessItem: "미입력",
      code: "BP-OCR-2138152063",
      evidenceProfileStatus: "완료" as const,
      id: "partner-1",
      name: "주아성다이소봉천본점",
      ownerType: "사업자" as const,
      phone: "",
      projectScope: "회계/자금",
      registrationNo: "213-81-52063",
      representative: "김기호",
      type: "매입" as const,
    };
    const updateBusinessPartner = vi.fn(async (id, input) => ({ ...partner, ...input, id }));
    render(<BusinessPartnerPage initialBusinessPartners={[partner]} initialSection="partners" updateBusinessPartner={updateBusinessPartner} />);

    fireEvent.click(screen.getByRole("button", { name: "주아성다이소봉천본점 수정" }));
    expect(screen.getByRole("heading", { name: "거래처 정보 수정" })).toBeInTheDocument();
    expect(screen.getByLabelText("사업자등록번호")).toHaveValue("213-81-52063");
    fireEvent.change(screen.getByLabelText("업태"), { target: { value: "소매업" } });
    fireEvent.change(screen.getByLabelText("종목"), { target: { value: "생활용품" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(updateBusinessPartner).toHaveBeenCalledWith("partner-1", expect.objectContaining({ businessCategory: "소매업", businessItem: "생활용품" }));
    expect(await screen.findByText("소매업")).toBeInTheDocument();
  });

  it("renders the item section and persists a new item through the configured action", async () => {
    const createItem = vi.fn(async (input) => ({ ...input, id: "item-db-1", usageStatus: "사용" as const }));
    render(<BusinessPartnerPage createItem={createItem} initialItems={[]} initialSection="items" />);
    expect(screen.getByRole("heading", { name: "품목등록" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "품목 추가" }));
    fireEvent.change(screen.getByLabelText("품목코드"), { target: { value: "ITEM-001" } });
    fireEvent.change(screen.getByLabelText("품목명"), { target: { value: "인쇄용역" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("인쇄용역")).toBeInTheDocument();
    expect(createItem).toHaveBeenCalledOnce();
  });

  it("renders bank account registration list and adds an account from the modal", () => {
    render(<BusinessPartnerPage initialSection="bank-accounts" />);

    expect(screen.getByRole("heading", { name: "은행통장 등록" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "개설일" })).toBeInTheDocument();
    expect(screen.queryByText("국민은행 신탁계좌")).not.toBeInTheDocument();
    expect(screen.queryByText("국민은행 운영계좌")).not.toBeInTheDocument();
    expect(screen.getAllByText("안동연(대방동지주택)")).toHaveLength(2);
    expect(screen.getByText("1006-901-293047")).toBeInTheDocument();
    expect(screen.getByText("무궁화신탁(분담금)")).toBeInTheDocument();
    expect(screen.getByText("1005-503-950527")).toBeInTheDocument();
    expect(screen.queryByText("등록된 은행통장이 없습니다.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "은행통장 추가" }));

    expect(screen.getByRole("dialog", { name: "은행통장 등록" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("개설일"), { target: { value: "2026-06-07" } });
    fireEvent.change(screen.getByLabelText("계좌명"), { target: { value: "추가 운영계좌" } });
    fireEvent.change(screen.getByLabelText("계좌번호"), { target: { value: "111-222-333333" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.queryByRole("dialog", { name: "은행통장 등록" })).not.toBeInTheDocument();
    expect(screen.getByText("추가 운영계좌")).toBeInTheDocument();
    expect(screen.getByText("111-222-333333")).toBeInTheDocument();
    expect(screen.getByText("2026-06-07")).toBeInTheDocument();
  });

  it("uses the server bank account creator when Supabase persistence is configured", async () => {
    const createdAccount = {
      accountName: "Supabase 운영계좌",
      accountNo: "222-333-444444",
      accountType: "운영계좌" as const,
      bankName: "우리은행",
      createdAt: "2026-06-07",
      id: "bank-db-003",
      lastSyncedAt: "미연동",
      status: "확인필요" as const,
      unmatchedCount: 0,
      usageStatus: "사용" as const,
    };

    render(
      <BusinessPartnerPage
        createBankAccount={async () => createdAccount}
        initialBankAccounts={[]}
        initialSection="bank-accounts"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "은행통장 추가" }));
    fireEvent.change(screen.getByLabelText("개설일"), { target: { value: "2026-06-07" } });
    fireEvent.change(screen.getByLabelText("계좌명"), { target: { value: "Supabase 운영계좌" } });
    fireEvent.change(screen.getByLabelText("계좌번호"), { target: { value: "222-333-444444" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("Supabase 운영계좌")).toBeInTheDocument();
    expect(screen.getByText("222-333-444444")).toBeInTheDocument();
    expect(screen.getByText("2026-06-07")).toBeInTheDocument();
  });

  it("opens a prefilled edit modal and updates the selected bank account without duplicating it", () => {
    render(<BusinessPartnerPage initialSection="bank-accounts" />);

    const row = screen.getByText("1006-901-293047").closest("tr");
    expect(row).not.toBeNull();

    fireEvent.click(within(row as HTMLTableRowElement).getByRole("button", { name: "수정" }));

    expect(screen.getByRole("dialog", { name: "은행통장 수정" })).toBeInTheDocument();
    expect(screen.getByLabelText("은행명")).toHaveValue("우리은행");
    expect(screen.getByLabelText("계좌명")).toHaveValue("안동연(대방동지주택)");
    expect(screen.getByLabelText("계좌번호")).toHaveValue("1006-901-293047");
    expect(screen.getByLabelText("개설일")).toHaveValue("2008-07-09");
    expect(screen.getByLabelText("계좌구분")).toHaveValue("운영계좌");

    fireEvent.change(screen.getByLabelText("은행명"), { target: { value: "우리은행" } });
    fireEvent.change(screen.getByLabelText("계좌명"), { target: { value: "안동연(대방동지주택)-수정" } });
    fireEvent.change(screen.getByLabelText("계좌번호"), { target: { value: "1006-901-293047-1" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.queryByRole("dialog", { name: "은행통장 수정" })).not.toBeInTheDocument();
    expect(screen.getByText("안동연(대방동지주택)-수정")).toBeInTheDocument();
    expect(screen.getByText("1006-901-293047-1")).toBeInTheDocument();
    expect(screen.queryByText("1006-901-293047")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(10);
  });

  it("uses the server bank account updater when Supabase persistence is configured", async () => {
    const updateBankAccount = vi.fn(async (id, input) => ({
      ...input,
      id,
      lastSyncedAt: "미연동",
      status: "확인필요" as const,
      unmatchedCount: 0,
      usageStatus: "사용" as const,
    }));

    render(
      <BusinessPartnerPage
        initialBankAccounts={[
          {
            accountName: "수정 전 계좌",
            accountNo: "111-222",
            accountType: "운영계좌",
            bankName: "우리은행",
            createdAt: "2026-06-01",
            id: "bank-db-001",
            lastSyncedAt: "미연동",
            status: "확인필요",
            unmatchedCount: 0,
            usageStatus: "사용",
          },
        ]}
        initialSection="bank-accounts"
        updateBankAccount={updateBankAccount}
      />,
    );

    const row = screen.getByText("111-222").closest("tr");
    fireEvent.click(within(row as HTMLTableRowElement).getByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByLabelText("계좌명"), { target: { value: "수정 후 계좌" } });
    fireEvent.change(screen.getByLabelText("계좌번호"), { target: { value: "333-444" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(updateBankAccount).toHaveBeenCalledWith("bank-db-001", {
      accountName: "수정 후 계좌",
      accountNo: "333-444",
      accountType: "운영계좌",
      bankName: "우리은행",
      createdAt: "2026-06-01",
    });
    expect(await screen.findByText("수정 후 계좌")).toBeInTheDocument();
    expect(screen.getByText("333-444")).toBeInTheDocument();
  });

  it("renders credit card registration list and adds a card from the modal", () => {
    render(<BusinessPartnerPage initialSection="cards" />);

    expect(screen.getByRole("heading", { name: "신용카드 등록" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "카드 발급일" })).toBeInTheDocument();
    expect(screen.getAllByText("법인카드").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "신용카드 추가" }));

    expect(screen.getByRole("dialog", { name: "신용카드 등록" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("카드 발급일"), { target: { value: "2026-06-07" } });
    fireEvent.change(screen.getByLabelText("카드명"), { target: { value: "추가 법인카드" } });
    fireEvent.change(screen.getByLabelText("카드번호"), { target: { value: "4444-5555-6666-7777" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(screen.queryByRole("dialog", { name: "신용카드 등록" })).not.toBeInTheDocument();
    expect(screen.getByText("추가 법인카드")).toBeInTheDocument();
    expect(screen.getByText("****-****-****-7777")).toBeInTheDocument();
    expect(screen.getByText("2026-06-07")).toBeInTheDocument();
  });

  it("renders account subject registration and registers selected recommendations", async () => {
    render(<BusinessPartnerPage initialAccountSubjects={[]} initialSection="account-subjects" />);

    expect(screen.getByRole("heading", { name: "계정과목 등록" })).toBeInTheDocument();
    expect(screen.getByText("운영비 예산안과 수지분석표 기준 추천 계정과목을 선택해 등록합니다.")).toBeInTheDocument();
    expect(screen.getByText("운영비 예산안 기준")).toBeInTheDocument();
    expect(screen.getByText("수지분석표 기준")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "계정과목" })).toBeInTheDocument();
    expect(screen.getByLabelText("추천 계정과목 임대료 선택")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("추천 계정과목 임대료 선택"));
    fireEvent.click(screen.getByRole("button", { name: "선택 항목 등록" }));

    expect(await screen.findByText("OP-310")).toBeInTheDocument();
    expect(screen.getAllByText("임대료").length).toBeGreaterThan(0);
    expect(screen.getByText("사무실 임차료 등")).toBeInTheDocument();
  });
});
