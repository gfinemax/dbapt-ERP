"use client";

import { useRef, useState, useTransition } from "react";
import { applyCollectionAssessmentCsv, previewCollectionAssessmentCsv } from "@/app/finance/collections/actions";
import { collectionAssessmentCsvTemplate } from "./collection-assessment-csv";
import type { CollectionAssessmentImportPreview } from "./collection-ledger-repository";

const actionLabels = { CREATE: "신규", UPDATE: "수정", UNCHANGED: "변경 없음", ERROR: "오류" } as const;
const actionClasses = { CREATE: "bg-blue-50 text-blue-700", UPDATE: "bg-amber-50 text-amber-800", UNCHANGED: "bg-slate-100 text-slate-600", ERROR: "bg-rose-50 text-rose-700" } as const;
const button = "min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold disabled:opacity-40";

export function CollectionAssessmentImport() {
  const [preview, setPreview] = useState<CollectionAssessmentImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const operationKey = useRef("");

  function downloadTemplate() {
    const blob = new Blob(["\uFEFF", collectionAssessmentCsvTemplate], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "분담금-부과자료-양식.csv"; anchor.click();
    URL.revokeObjectURL(url);
  }

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold">CSV 일괄 등록</h2><p className="mt-1 text-sm text-slate-600">외부 조합원 ID로만 연결해. 파일을 먼저 미리보고 신규·수정·오류를 확인한 뒤 한 번에 적용해.</p></div>
      <button className={button} onClick={downloadTemplate} type="button">CSV 양식 받기</button>
    </div>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault(); setMessage(""); const data = new FormData(event.currentTarget);
      startTransition(async () => { try { const result = await previewCollectionAssessmentCsv(data); setPreview(result); operationKey.current = crypto.randomUUID(); setMessage("미리보기를 만들었어. 적용 전에 오류와 변경 내용을 확인해줘."); } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "CSV를 확인하지 못했어."); } });
    }}>
      <label className="grid min-w-72 flex-1 gap-2 text-sm font-semibold">UTF-8 CSV 파일
        <input accept=".csv,text/csv" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 file:mr-3" name="file" required type="file" />
      </label>
      <button className="min-h-11 rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={pending} type="submit">{pending ? "확인 중..." : "미리보기"}</button>
    </form>
    <p className="mt-2 text-xs text-slate-500">필수 열: 외부 조합원 ID, 조합원명, 부과코드, 부과액 · 선택 열: 조합원번호, 납부기한(YYYY-MM-DD) · 최대 1,000건/1MB</p>

    {preview ? <div className="mt-5 overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div><p className="font-bold">{preview.file_name} · {preview.row_count}건</p><p className="mt-1 text-sm text-slate-600">신규 {preview.create_count} · 수정 {preview.update_count} · 변경 없음 {preview.unchanged_count} · 오류 {preview.error_count}</p></div>
        <button className="min-h-10 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={pending || preview.error_count > 0 || preview.status === "APPLIED"} onClick={() => {
          startTransition(async () => { try { operationKey.current ||= crypto.randomUUID(); const result = await applyCollectionAssessmentCsv(preview.batch_id, operationKey.current); setPreview(result); setMessage(`적용했어. 신규 ${result.create_count}건, 수정 ${result.update_count}건을 원장에 반영했어.`); } catch (error) { setMessage(error instanceof Error ? error.message : "일괄 등록하지 못했어."); } });
        }} type="button">{preview.status === "APPLIED" ? "적용 완료" : pending ? "적용 중..." : "검토한 내용 적용"}</button>
      </div>
      {preview.error_count > 0 ? <p className="border-b bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">오류 행이 있어 적용할 수 없어. 원본 CSV를 수정한 뒤 새 미리보기를 만들어줘.</p> : null}
      <div className="max-h-96 overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs text-slate-600"><tr><th className="px-3 py-2">행</th><th className="px-3 py-2">외부 조합원 ID</th><th className="px-3 py-2">조합원</th><th className="px-3 py-2">부과코드</th><th className="px-3 py-2">납부기한</th><th className="px-3 py-2 text-right">부과액</th><th className="px-3 py-2">판정</th></tr></thead>
        <tbody className="divide-y">{preview.rows.map((row) => <tr key={`${row.row_number}:${row.external_member_id}:${row.assessment_code}`}><td className="px-3 py-3">{row.row_number}</td><td className="px-3 py-3 font-semibold">{row.external_member_id}</td><td className="px-3 py-3">{row.member_name_snapshot}{row.member_no ? ` · ${row.member_no}` : ""}</td><td className="px-3 py-3">{row.assessment_code}</td><td className="px-3 py-3">{row.due_date || "-"}</td><td className="px-3 py-3 text-right">{Number(row.assessed_amount).toLocaleString("ko-KR")}원</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${actionClasses[row.action]}`}>{actionLabels[row.action]}</span>{row.issue ? <p className="mt-1 text-xs text-rose-700">{row.issue}</p> : null}</td></tr>)}</tbody>
      </table></div>
    </div> : null}
    {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
  </section>;
}
