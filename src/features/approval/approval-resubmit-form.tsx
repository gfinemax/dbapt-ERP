"use client";

import { useActionState } from "react";
import {
  resubmitApprovalAction,
  type ApprovalResubmitActionState,
} from "@/app/approval/actions";
import type { ApprovalDocument } from "./approval-domain";

const initialState: ApprovalResubmitActionState = {};
const inputClass =
  "mt-1 w-full rounded-xl border border-[var(--color-soft-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-deep-cobalt)]";

export function ApprovalResubmitForm({
  document,
  rejectionReason,
}: {
  document: ApprovalDocument;
  rejectionReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    resubmitApprovalAction,
    initialState,
  );

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/70 p-5">
      <p className="text-xs font-bold text-red-700">반려 사유</p>
      <p className="mt-1 text-sm font-semibold text-red-900">
        {rejectionReason || "등록된 반려 사유가 없습니다. 결재 이력을 확인해주세요."}
      </p>
      <h2 className="mt-5 text-lg font-bold">수정 후 재상신</h2>
      <p className="mt-1 text-xs text-[var(--color-stone)]">
        내용을 수정해 재상신하면 기존 반려 이력은 보존되고 결재선이 첫 단계부터 다시 시작됩니다.
      </p>
      <form action={formAction} className="mt-4 grid gap-3">
        <input name="id" type="hidden" value={document.id} />
        <input name="actorLabel" type="hidden" value={document.drafterLabel} />
        <label className="text-sm font-semibold">
          제목
          <input className={inputClass} defaultValue={document.title} name="title" required />
        </label>
        <label className="text-sm font-semibold">
          기안 목적
          <input className={inputClass} defaultValue={document.purpose} name="purpose" required />
        </label>
        <label className="text-sm font-semibold">
          기안 내용
          <textarea className={`${inputClass} min-h-28`} defaultValue={document.body} name="body" required />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            금액
            <input className={inputClass} defaultValue={document.amount} min="0" name="amount" required type="number" />
          </label>
          <label className="text-sm font-semibold">
            거래처
            <input className={inputClass} defaultValue={document.counterpartyName} name="counterpartyName" />
          </label>
          <label className="text-sm font-semibold">
            예산 항목
            <input className={inputClass} defaultValue={document.budgetItem} name="budgetItem" />
          </label>
          <label className="text-sm font-semibold">
            프로젝트
            <input className={inputClass} defaultValue={document.projectName} name="projectName" />
          </label>
        </div>
        {state.error ? (
          <p className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-red-700" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800" role="status">
            수정한 기안을 다시 상신했어요.
          </p>
        ) : null}
        <button
          className="mt-1 rounded-full bg-red-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
          disabled={pending}
        >
          {pending ? "재상신 중" : "수정 내용으로 재상신"}
        </button>
      </form>
    </section>
  );
}
