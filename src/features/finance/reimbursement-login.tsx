"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reimbursementLogin } from "@/app/finance/reimbursements/actions";

const card = "rounded-2xl border border-[var(--color-soft-border)] bg-white p-5";
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const button = "rounded-lg bg-[var(--color-deep-cobalt)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";

export function ReimbursementLogin({
  error,
  title = "개인 지출 정산·월 마감",
  description = "사용월의 예산과 실제 지급일을 구분해서 관리해. 마감과 승인 이력을 남기기 위해 본인 계정으로 로그인해줘.",
}: {
  error?: string;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(form: FormData) {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await reimbursementLogin(form);
        if (!result.ok) throw new Error(result.message);
        setMessage("로그인했어.");
        router.refresh();
      } catch (submitError) {
        setMessage(submitError instanceof Error ? submitError.message : "처리하지 못했어. 다시 확인해줘.");
      }
    });
  }

  return <section className={`${card} mx-auto max-w-lg`}><h1 className="text-2xl font-bold">{title}</h1>
    <p className="my-4 text-sm text-slate-600">{description}</p>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); submit(new FormData(event.currentTarget)); }}>
      <label className="block">이메일<input className={input} name="email" type="email" autoComplete="username" required /></label>
      <label className="block">비밀번호<input className={input} name="password" type="password" autoComplete="current-password" required /></label>
      <button className={button} disabled={pending}>로그인</button>
    </form><p role="status" className="mt-4 text-sm">{message || error}</p>
    <p className="mt-3 text-sm text-slate-600">계정이 없으면 정산 관리자에게 계정과 권한 등록을 요청해줘.</p>
  </section>;
}
