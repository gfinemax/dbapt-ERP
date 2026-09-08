"use client";
import { startTransition, useActionState, useRef, type ReactNode } from "react";
export function ApprovalCommandForm({ action, children, className }: { action: (form: FormData) => Promise<void>; children: ReactNode; className?: string }) {
 const busy = useRef(false);
 const [state, formAction, pending] = useActionState(async (_previous: { error?: string; success?: boolean }, data: FormData): Promise<{ error?: string; success?: boolean }> => {
  try { await action(data); return { success: true }; }
  catch (error) {
   if (error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT")) throw error;
   return { error: error instanceof Error ? error.message : "처리하지 못했어. 내용을 확인하고 다시 시도해줘." };
  } finally { busy.current = false; }
 }, {});
 return <form className={className} onSubmit={event => {
  event.preventDefault();
  if (busy.current) return;
  const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
  busy.current = true;
  startTransition(() => formAction(data));
 }}>
  <fieldset disabled={pending} className="contents">{children}</fieldset>
  {pending ? <p role="status" className="mt-2 text-sm">처리 중</p> : null}
  {state.error ? <p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.error}</p> : null}
  {state.success ? <p role="status" className="mt-2 text-sm text-emerald-800">처리 완료</p> : null}
 </form>;
}
