"use client";

import { useRef, useState, useTransition } from "react";
import { applyCollectionAssessmentCsv, cancelCollectionAssessmentCsv, loadCollectionAssessmentCsv, previewCollectionAssessmentCsv } from "@/app/finance/collections/actions";
import { collectionAssessmentCsvTemplate } from "./collection-assessment-csv";
import type { CollectionAssessmentImportPreview, CollectionAssessmentImportSummary } from "./collection-ledger-repository";

const actionLabels = { CREATE: "신규", UPDATE: "수정", UNCHANGED: "변경 없음", ERROR: "오류" } as const;
const actionClasses = { CREATE: "bg-blue-50 text-blue-700", UPDATE: "bg-amber-50 text-amber-800", UNCHANGED: "bg-slate-100 text-slate-600", ERROR: "bg-rose-50 text-rose-700" } as const;
const statusLabels = { PREVIEW: "검토 대기", APPLIED: "적용 완료", CANCELLED: "검토 취소" } as const;
const button = "min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold disabled:opacity-40";

function download(name: string, content: string) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}
function csv(value: unknown) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function resultCsv(preview: CollectionAssessmentImportPreview) {
  const headers = ["행", "외부 조합원 ID", "조합원번호", "조합원명", "부과코드", "납부기한", "부과액", "판정", "확인사항"];
  return [headers, ...preview.rows.map((row) => [row.row_number, row.external_member_id, row.member_no, row.member_name_snapshot, row.assessment_code, row.due_date, row.assessed_amount, actionLabels[row.action], row.issue])]
    .map((row) => row.map(csv).join(",")).join("\r\n");
}

export function CollectionAssessmentImport({ initialHistory = [] }: { initialHistory?: CollectionAssessmentImportSummary[] }) {
  const [preview, setPreview] = useState<CollectionAssessmentImportPreview | null>(null);
  const [history, setHistory] = useState(initialHistory);
  const [message, setMessage] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [pending, startTransition] = useTransition();
  const operationKey = useRef("");

  function refreshHistory(batchId?: string) {
    startTransition(async () => {
      try { const result = await loadCollectionAssessmentCsv(batchId ?? ""); setHistory(result.batches); if (result.selected) setPreview(result.selected); }
      catch (error) { setMessage(error instanceof Error ? error.message : "가져오기 이력을 확인하지 못했어."); }
    });
  }

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-xl font-bold">CSV 일괄 등록</h2><p className="mt-1 text-sm text-slate-600">외부 조합원 ID로만 연결해. 원본 해시와 검토 결과는 취소해도 감사 이력으로 남아.</p></div>
      <button className={button} onClick={() => download("분담금-부과자료-양식.csv", collectionAssessmentCsvTemplate)} type="button">CSV 양식 받기</button>
    </div>
    <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault(); setMessage(""); const data = new FormData(event.currentTarget);
      startTransition(async () => { try { const result = await previewCollectionAssessmentCsv(data); setPreview(result); operationKey.current = crypto.randomUUID(); setMessage("미리보기를 만들었어. 적용 전에 오류와 변경 내용을 확인해줘."); refreshHistory(result.batch_id); } catch (error) { setPreview(null); setMessage(error instanceof Error ? error.message : "CSV를 확인하지 못했어."); } });
    }}>
      <label className="grid min-w-72 flex-1 gap-2 text-sm font-semibold">UTF-8 CSV 파일<input accept=".csv,text/csv" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 file:mr-3" name="file" required type="file" /></label>
      <button className="min-h-11 rounded-lg bg-slate-900 px-5 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={pending} type="submit">{pending ? "확인 중..." : "미리보기"}</button>
    </form>
    <p className="mt-2 text-xs text-slate-500">필수 열: 외부 조합원 ID, 조합원명, 부과코드, 부과액 · 선택 열: 조합원번호, 납부기한(YYYY-MM-DD) · 최대 1,000건/1MB</p>

    {preview ? <div className="mt-5 overflow-hidden rounded-xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div><p className="font-bold">{preview.file_name} · {preview.row_count}건</p><p className="mt-1 text-sm text-slate-600">{statusLabels[preview.status]} · 신규 {preview.create_count} · 수정 {preview.update_count} · 변경 없음 {preview.unchanged_count} · 오류 {preview.error_count}</p>{preview.cancel_reason ? <p className="mt-1 text-xs text-rose-700">취소 사유: {preview.cancel_reason}</p> : null}</div>
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => download(`분담금-가져오기-${preview.batch_id}.csv`, resultCsv(preview))} type="button">결과 CSV</button>
          {preview.status === "PREVIEW" ? <button className="min-h-10 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40" disabled={pending || preview.error_count > 0} onClick={() => {
            startTransition(async () => { try { operationKey.current ||= crypto.randomUUID(); const result = await applyCollectionAssessmentCsv(preview.batch_id, operationKey.current); setPreview(result); refreshHistory(result.batch_id); setMessage(`적용했어. 신규 ${result.create_count}건, 수정 ${result.update_count}건을 원장에 반영했어.`); } catch (error) { setMessage(error instanceof Error ? error.message : "일괄 등록하지 못했어."); } });
          }} type="button">{pending ? "적용 중..." : "검토한 내용 적용"}</button> : null}
        </div>
      </div>
      {preview.error_count > 0 && preview.status === "PREVIEW" ? <p className="border-b bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">오류 행이 있어 적용할 수 없어. 결과 CSV로 확인한 뒤 원본 CSV를 수정해 새 미리보기를 만들어줘.</p> : null}
      {preview.status === "PREVIEW" ? <form className="flex flex-wrap gap-2 border-b bg-slate-50 p-3" onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => { try { const result = await cancelCollectionAssessmentCsv(preview.batch_id, cancelReason, crypto.randomUUID()); setPreview(result); setCancelReason(""); refreshHistory(result.batch_id); setMessage("미리보기를 취소했어. 원본 해시와 검토 행은 감사 이력에 보존돼."); } catch (error) { setMessage(error instanceof Error ? error.message : "미리보기를 취소하지 못했어."); } });
      }}><input className="min-h-10 min-w-64 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" onChange={(event) => setCancelReason(event.target.value)} placeholder="미리보기 취소 사유" required value={cancelReason} /><button className={button} disabled={pending}>검토 취소</button></form> : null}
      <div className="max-h-96 overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs text-slate-600"><tr><th className="px-3 py-2">행</th><th className="px-3 py-2">외부 조합원 ID</th><th className="px-3 py-2">조합원</th><th className="px-3 py-2">부과코드</th><th className="px-3 py-2">납부기한</th><th className="px-3 py-2 text-right">부과액</th><th className="px-3 py-2">판정</th></tr></thead>
        <tbody className="divide-y">{preview.rows.map((row) => <tr key={`${row.row_number}:${row.external_member_id}:${row.assessment_code}`}><td className="px-3 py-3">{row.row_number}</td><td className="px-3 py-3 font-semibold">{row.external_member_id}</td><td className="px-3 py-3">{row.member_name_snapshot}{row.member_no ? ` · ${row.member_no}` : ""}</td><td className="px-3 py-3">{row.assessment_code}</td><td className="px-3 py-3">{row.due_date || "-"}</td><td className="px-3 py-3 text-right">{Number(row.assessed_amount).toLocaleString("ko-KR")}원</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${actionClasses[row.action]}`}>{actionLabels[row.action]}</span>{row.issue ? <p className="mt-1 text-xs text-rose-700">{row.issue}</p> : null}</td></tr>)}</tbody>
      </table></div>
    </div> : null}

    <details className="mt-5 rounded-xl border bg-white p-4"><summary className="cursor-pointer font-bold">최근 가져오기 이력 {history.length}건</summary>
      <div className="mt-3 divide-y">{history.map((item) => <div className="flex flex-wrap items-center justify-between gap-3 py-3" key={item.batch_id}><div><p className="text-sm font-bold">{item.file_name} · {item.row_count}건</p><p className="mt-1 text-xs text-slate-600">{new Date(item.created_at).toLocaleString("ko-KR")} · {statusLabels[item.status]} · 신규 {item.create_count}/수정 {item.update_count}/오류 {item.error_count}</p></div><button className={button} disabled={pending} onClick={() => refreshHistory(item.batch_id)} type="button">검토 결과 보기</button></div>)}{!history.length ? <p className="py-3 text-sm text-slate-500">아직 가져오기 이력이 없어.</p> : null}</div>
    </details>
    {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
  </section>;
}
