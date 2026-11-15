"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { applyExpenseApprovalPeriodRepairAction, previewExpenseApprovalPeriodRepairAction } from "@/app/finance/expense-authorizations/period-actions";
import type { ManagedExpenseResolution } from "./expense-resolution-page";
import type { previewExpenseApprovalRepair } from "./expense-approval-period";
import { seoulToday } from "@/features/approval/approval-effective-policy";

type Preview = ReturnType<typeof previewExpenseApprovalRepair>;
export function ExpenseApprovalPeriodRepair({ record }: { record: ManagedExpenseResolution }) {
  const router = useRouter();
  const [date, setDate] = useState(record.approvalPolicy?.kind === "HISTORICAL" ? record.approvalPolicy.referenceDate : "");
  const [reason, setReason] = useState(record.approvalPolicy?.originalReference ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  const key = useRef("");
  function changed() { setPreview(null); setMessage(""); key.current = ""; }
  async function inspect() {
    if (busy.current) return;
    busy.current = true; setPending(true); setMessage("");
    try { setPreview(await previewExpenseApprovalPeriodRepairAction(record.id, date, reason)); key.current = crypto.randomUUID(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "미리보기를 불러오지 못했습니다."); }
    finally { busy.current = false; setPending(false); }
  }
  async function apply() {
    if (!preview?.canApply || busy.current) return;
    busy.current = true; setPending(true); setMessage("");
    try {
      await applyExpenseApprovalPeriodRepairAction({ id: record.id, expected: preview.before, expectedVersion: preview.before.authorization?.version ?? 0, referenceDate: preview.policy.referenceDate, reason: preview.policy.originalReference!, key: key.current });
      setPreview(null); setMessage("결재선과 계정 연결을 함께 정리했습니다. 계정 연결 상태를 확인한 뒤 다시 상신해주세요."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "정리하지 못했습니다. 입력 내용을 유지했습니다."); }
    finally { busy.current = false; setPending(false); }
  }
  const describe = (value: ManagedExpenseResolution) => value.approvalLine.map(step => step.order + ". " + step.approver + " " + step.role).join(" → ") || "실제 결재자 없음";
  return <section aria-label="결재선 기간 정리" className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
    <h2 className="font-bold">결재선 기간 정리 · 관리자</h2>
    <p className="mt-2 text-sm">장현제 입사일 2026-06-22 · 결재권한 시작 2026-07-01. 원문 날짜를 확인한 뒤 변경 전후를 검토해주세요.</p>
    <p className="mt-2 text-xs">지출일: {record.actualExpenseDate || "미확인"} · 상태: {record.approvalStatus}. 지출일이나 시스템 입력일을 원문 결재일로 자동 대체하지 않습니다.</p>
    <fieldset disabled={pending} className="mt-3 space-y-3">
      <label className="block text-sm font-semibold">원문 결재 기준일<input aria-label="정리할 원문 결재 기준일" className="mt-1 w-full rounded-lg border bg-white p-2" type="date" max={seoulToday()} value={date} onChange={event => { setDate(event.target.value); changed(); }} /></label>
      <label className="block text-sm font-semibold">원문 확인 근거<textarea aria-label="결재선 정리 확인 근거" className="mt-1 w-full rounded-lg border bg-white p-2" value={reason} onChange={event => { setReason(event.target.value); changed(); }} placeholder="원문 문서번호·서명일 등 확인 근거" /></label>
      <button type="button" className="rounded-lg border bg-white px-3 py-2 font-semibold disabled:opacity-40" disabled={!date || !reason.trim()} onClick={() => void inspect()}>결재선 변경 미리보기</button>
    </fieldset>
    {preview ? <div className="mt-4 space-y-3 rounded-lg border bg-white p-3">
      <p><strong>변경 전:</strong> {describe(preview.before)}</p><p><strong>변경 후:</strong> {describe(preview.after)}</p>
      <p className="text-sm">표시 참여자: {preview.after.approvalParticipants?.map(person => person.name + " " + person.action).join(" · ") || "실제 결재선 기준 표시"}</p>
      <p className="text-sm">계정 연결 유지: {preview.bindingSteps.length}/{preview.after.approvalLine.length}명 · 미연결 계정은 별도로 확인해야 합니다.</p>
      {preview.before.approvalStatus === "승인대기" && preview.canApply ? <p className="text-sm text-amber-800">아직 승인 처리 전인 문서를 작성중으로 회수합니다. 기존 상신 이력은 보존하고 다시 상신해야 합니다.</p> : null}
      {preview.issues.length ? <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-red-700">{preview.issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
      <button type="button" disabled={!preview.canApply || pending} className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-40" onClick={() => void apply()}>{pending ? "처리 중" : "확인한 결재선 정리 적용"}</button>
    </div> : null}
    <p role="status" className="mt-3 text-sm">{message}</p>
  </section>;
}
