import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrustOperatingWorkspace } from "./trust-operating-repository";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/finance/trust/operating-actions", () => ({
  executeTrustOperating: mocks.execute,
}));
import { TrustOperatingPage } from "./trust-operating-page";

const workspace = (): TrustOperatingWorkspace => ({
  periods: [
    {
      id: "period",
      month: "2026-09-01",
      contract_version_id: "contract",
      title: "9월 운영비",
      requested_amount: 1000,
      opening_balance: 200,
      closing_balance: null,
      status: "OPEN",
      lock_version: 3,
      request_reference: "접수-1",
      submitted_at: "2026-09-01",
      settled_at: null,
      totals: {
        requested: 1000,
        opening: 200,
        received: 800,
        used: 500,
        returned: 100,
        balance: 400,
      },
    },
  ],
  bank_links: [],
  usage: [],
  contracts: [{ id: "contract", name: "운영비 계약", conditions: {} }],
  bank_candidates: [
    {
      id: "deposit",
      transacted_at: "2026-09-02",
      description: "신탁 입금",
      deposit_amount: 800,
      withdrawal_amount: 0,
      bank_account_id: "operating",
    },
  ],
  usage_candidates: [
    {
      transaction_id: "tx",
      title: "소모품",
      amount: 500,
      paid: 500,
      revision: 2,
      source_signature: "source",
      contract_version_id: "contract",
      signature: "snapshot",
    },
  ],
  viewer: { permissions: ["ADMIN"] },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({
    id: "period",
    lock_version: 4,
    status: "OPEN",
    totals: {},
  });
});

describe("TrustOperatingPage", () => {
  it("separates requested, actually received, used, returned and carryover amounts", () => {
    render(<TrustOperatingPage workspace={workspace()} mode="funds" />);
    expect(
      screen.getByRole("heading", { name: "월 운영비 요청·수령" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1,000원" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "800원" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "400원" })).toBeInTheDocument();
    expect(
      screen.getByText(/요청금액이 아니라 운영계좌의 실제 입금 거래/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "월 정산서 출력" }));
    expect(
      screen.getByRole("dialog", { name: "월 운영비 정산서 출력 미리보기" }),
    ).toHaveTextContent("요청액1,000원");
    expect(screen.getByRole("dialog")).toHaveTextContent("실제 수령800원");
  });

  it("links an authoritative usage candidate with its server snapshot signature", () => {
    render(<TrustOperatingPage workspace={workspace()} mode="settlement" />);
    fireEvent.change(screen.getByLabelText("지출 원본"), {
      target: { value: "tx" },
    });
    fireEvent.change(screen.getByLabelText("연결 근거"), {
      target: { value: "9월 운영비 사용" },
    });
    fireEvent.submit(screen.getByLabelText("지출 원본").closest("form")!);
    expect(mocks.execute).toHaveBeenCalledWith(
      "USAGE_LINK",
      {
        period_id: "period",
        transaction_id: "tx",
        signature: "snapshot",
        reason: "9월 운영비 사용",
      },
      expect.any(String),
    );
  });
});
