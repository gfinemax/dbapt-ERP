"use client";

import { useActionState, useState } from "react";
import {
  decideApprovalAction,
  type ApprovalDecisionActionState,
} from "@/app/approval/actions";

const initialState: ApprovalDecisionActionState = {};

export function ApprovalDecisionForm({
  approverLabel,
  documentId,
}: {
  approverLabel: string;
  documentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    decideApprovalAction,
    initialState,
  );
  const [comment, setComment] = useState("");
  const [clientError, setClientError] = useState("");
  const error = clientError || state.error;

  return (
    <form
      action={formAction}
      className="space-y-3"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null;
        if (submitter?.value === "REJECT" && !comment.trim()) {
          event.preventDefault();
          setClientError("반려 사유를 입력해주세요.");
          return;
        }
        setClientError("");
      }}
    >
      <input name="id" type="hidden" value={documentId} />
      <label className="text-sm font-semibold">
        처리자
        <input
          className="mt-1 w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2"
          defaultValue={approverLabel}
          name="actorLabel"
          required
        />
      </label>
      <label className="text-sm font-semibold">
        의견
        <textarea
          aria-describedby={error ? "approval-decision-error" : undefined}
          aria-invalid={Boolean(error)}
          className={`mt-1 min-h-20 w-full rounded-xl border px-3 py-2 ${error ? "border-red-500" : "border-[var(--color-soft-border)]"}`}
          name="comment"
          onChange={(event) => {
            setComment(event.target.value);
            if (clientError && event.target.value.trim()) setClientError("");
          }}
          placeholder="반려할 때는 사유를 반드시 입력해주세요."
          value={comment}
        />
      </label>
      {error ? (
        <p
          className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
          id="approval-decision-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800" role="status">
          결재 처리가 완료됐어요.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          className="rounded-full bg-[var(--color-deep-cobalt)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          disabled={pending}
          name="decision"
          value="APPROVE"
        >
          {pending ? "처리 중" : "승인"}
        </button>
        <button
          className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          disabled={pending}
          name="decision"
          value="REJECT"
        >
          {pending ? "처리 중" : "반려"}
        </button>
      </div>
    </form>
  );
}
