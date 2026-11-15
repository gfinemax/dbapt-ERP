"use client";
import { seoulToday, type ApprovalRecordKind } from "@/features/approval/approval-effective-policy";

export function ExpenseApprovalPolicyFields({ kind = "CURRENT", originalDate = "", originalReference = "", canRestore, onKind, onDate, onReference }: {
  kind?: ApprovalRecordKind; originalDate?: string; originalReference?: string; canRestore: boolean;
  onKind: (kind: ApprovalRecordKind) => void; onDate: (date: string) => void; onReference: (reference: string) => void;
}) {
  const field = "mt-1 min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm";
  return <fieldset className="mt-3 space-y-3 rounded-lg border bg-white p-3">
    <legend className="px-1 text-sm font-bold">결재 기준일</legend>
    <label className="block text-xs font-semibold">결재 기준 구분<select aria-label="결재 기준 구분" className={field} value={kind} disabled={!canRestore && kind === "HISTORICAL"} onChange={event => onKind(event.target.value as ApprovalRecordKind)}>
      <option value="CURRENT">현재 새로 상신 · 실제 상신일 기준</option><option value="HISTORICAL" disabled={!canRestore}>과거 문서 복원 · 원문 결재일 기준</option>
    </select></label>
    {kind === "HISTORICAL" ? <><label className="block text-xs font-semibold">원문 결재 기준일<input aria-label="원문 결재 기준일" className={field} type="date" max={seoulToday()} value={originalDate} disabled={!canRestore} onChange={event => onDate(event.target.value)} /></label>
    <label className="block text-xs font-semibold">원문 결재일 확인 근거<input aria-label="원문 결재일 확인 근거" className={field} value={originalReference} disabled={!canRestore} placeholder="원문 문서번호·서명일 등 확인한 근거" onChange={event => onReference(event.target.value)} /></label></> : <p className="text-xs">현재 기준일: {seoulToday()} · 지출일과 구분합니다. 상신일이 바뀌면 초안을 다시 저장해주세요.</p>}
    <p className="text-xs leading-5 text-slate-600">장현제 이사: 입사 2026-06-22 · 결재권한 시작 2026-07-01. 6월 22~30일은 작성만 가능하며, 결재·검토·전결·생략 참여자로 표시하지 않습니다.</p>
  </fieldset>;
}
