import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn() }));
vi.mock("@/app/finance/collections/actions", () => ({ previewCollectionAssessmentCsv: actions.preview, applyCollectionAssessmentCsv: actions.apply }));
import { CollectionAssessmentImport } from "./collection-assessment-import";

describe("collection assessment import", () => {
  it("shows row decisions and blocks apply when the preview has errors", async () => {
    actions.preview.mockResolvedValue({ batch_id: "b", file_name: "rows.csv", content_hash: "a".repeat(64), status: "PREVIEW", row_count: 1, create_count: 0, update_count: 0, unchanged_count: 0, error_count: 1, rows: [{ row_number: 2, external_member_id: "id-1", member_no: "", member_name_snapshot: "홍길동", assessment_code: "A", due_date: "", assessed_amount: 1000, action: "ERROR", issue: "중복" }] });
    render(<CollectionAssessmentImport />);
    const file = new File(["csv"], "rows.csv", { type: "text/csv" });
    const input = screen.getByLabelText("UTF-8 CSV 파일");
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.submit(input.closest("form")!);
    await screen.findByText("id-1");
    expect(screen.getByRole("button", { name: "검토한 내용 적용" })).toBeDisabled();
    expect(screen.getByText("중복")).toBeInTheDocument();
  });
  it("applies an error-free preview", async () => {
    const preview = { batch_id: "b", file_name: "rows.csv", content_hash: "a".repeat(64), status: "PREVIEW", row_count: 1, create_count: 1, update_count: 0, unchanged_count: 0, error_count: 0, rows: [{ row_number: 2, external_member_id: "id-1", member_no: "", member_name_snapshot: "홍길동", assessment_code: "A", due_date: "", assessed_amount: 1000, action: "CREATE", issue: null }] };
    actions.preview.mockResolvedValue(preview); actions.apply.mockResolvedValue({ ...preview, status: "APPLIED" });
    render(<CollectionAssessmentImport />);
    const input = screen.getByLabelText("UTF-8 CSV 파일");
    fireEvent.change(input, { target: { files: [new File(["csv"], "rows.csv", { type: "text/csv" })] } });
    fireEvent.submit(input.closest("form")!);
    fireEvent.click(await screen.findByRole("button", { name: "검토한 내용 적용" }));
    await waitFor(() => expect(actions.apply).toHaveBeenCalledWith("b", expect.any(String)));
    expect(await screen.findByRole("button", { name: "적용 완료" })).toBeDisabled();
  });
});
