import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/finance/expenses/actions", () => ({ loadExpenseClassificationAction: vi.fn(), saveExpenseClassificationAction: vi.fn() }));
import { ExpenseClassificationEditor } from "./expense-classification-editor";
import { validateClassification, type ExpenseClassificationContext, type ExpenseClassificationInput } from "./expense-classification";
const context: ExpenseClassificationContext = { transactionId: "tx", sourceSignature: "signature", classification: null, advances: [{ id: "advance", title: "받은 운영비" }] };
describe("expense classification", () => {
  it("preserves independent personal-card and advance-fund axes", async () => {
    const save = vi.fn().mockResolvedValue({ version: 1 });
    render(<ExpenseClassificationEditor transactionId="tx" load={async () => context} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "분류 확인·수정" }));
    fireEvent.change(await screen.findByLabelText("결제수단"), { target: { value: "PERSONAL_CARD" } });
    fireEvent.change(screen.getByLabelText("돈의 출처"), { target: { value: "ADVANCE" } });
    fireEvent.change(screen.getByLabelText("받은 선지급금"), { target: { value: "advance" } });
    fireEvent.change(screen.getByLabelText("분류 확인 사유"), { target: { value: "실제 선지급 내역 확인" } });
    fireEvent.click(screen.getByRole("button", { name: "분류 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({ cost_category: "UNKNOWN", payment_method: "PERSONAL_CARD", funding_origin: "ADVANCE", advance_transaction_id: "advance", expected_version: 0 });
    expect(await screen.findByRole("status")).toHaveTextContent("승인·지급 상태는 변경하지 않았어");
  });
  it("preserves user input and operation key when a save outcome is uncertain", async () => {
    const save = vi.fn().mockRejectedValue(new Error("응답 확인 실패"));
    render(<ExpenseClassificationEditor transactionId="tx" load={async () => context} save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "분류 확인·수정" }));
    fireEvent.change(await screen.findByLabelText("분류 확인 사유"), { target: { value: "확인한 내용" } });
    fireEvent.click(screen.getByRole("button", { name: "분류 저장" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("응답 확인 실패"));
    expect(screen.getByLabelText("분류 확인 사유")).toHaveValue("확인한 내용");
    fireEvent.click(screen.getByRole("button", { name: "분류 저장" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[0][1]).toBe(save.mock.calls[1][1]);
  });
  it("rejects contradictory corporate-card funding and missing advance references", () => {
    const input: ExpenseClassificationInput = { transaction_id: "tx", expected_version: 0, source_signature: "s", cost_category: "UNKNOWN", payment_method: "CORPORATE_CARD", funding_origin: "PERSONAL", processing_route: "UNKNOWN", advance_transaction_id: null, reason: "확인" };
    expect(validateClassification(input)).toContain("법인카드는 조합 자금으로 확인해줘.");
    expect(validateClassification({ ...input, payment_method: "PERSONAL_CARD", funding_origin: "ADVANCE" })).toContain("받은 선지급금을 선택해줘.");
  });
});
