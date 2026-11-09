"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  confirmFixedCertificateAccountAssignments,
  previewFixedCertificateAssignmentFromGoogleSheet,
  updateFixedCertificateAssignmentMatch,
} from "@/app/finance/collections/actions";
import type { FixedCertificateAssignmentWorkspace } from "./collection-ledger-repository";

const sourceUrl = "https://docs.google.com/spreadsheets/d/19RqM41iIIypykwyPuXL93ZrhFxZcJUl35_Ud6IijtoU/edit?gid=72846910#gid=72846910";
const secondary = "min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
const primary = "min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40";
const input = "min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const money = (value: number) => `${Number(value).toLocaleString("ko-KR")}원`;

export function FixedCertificateAssignmentPanel({
  initialValue,
  canDecide,
}: {
  initialValue: FixedCertificateAssignmentWorkspace | null;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [selections, setSelections] = useState<Record<number, string>>({});
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<FixedCertificateAssignmentWorkspace>, success: string) => {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await work();
        setValue(result);
        setMessage(success);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "처리하지 못했어.");
      }
    });
  };

  if (!value) {
    return <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-blue-950">정액필증 계정과목 대조</h3>
          <p className="mt-1 text-sm text-blue-900">116명 명단은 분담금, 명단 밖 21명은 가수금 후보로 대조해. 아직 원본에는 적용하지 않아.</p>
        </div>
        <button className={primary} disabled={!canDecide || pending} onClick={() => run(previewFixedCertificateAssignmentFromGoogleSheet, "116명 명단 대조 미리보기를 만들었어.")} type="button">
          116명 명단 대조 미리보기
        </button>
      </div>
      <p className="mt-3 text-xs text-blue-800"><a className="font-semibold underline" href={sourceUrl} rel="noreferrer" target="_blank">Google 시트 조합원연명부(116명) B4:B119</a>의 이름만 읽고 주민번호·주소 등 다른 열은 가져오지 않아.</p>
      {message ? <p className="mt-3 text-sm font-semibold text-rose-700" role="status">{message}</p> : null}
    </section>;
  }

  const { batch, summary } = value;
  const matchedIds = value.rows.flatMap((row) => row.source_root_recognition_id ? [row.source_root_recognition_id] : []);
  const uniqueMatched = new Set(matchedIds).size;
  const ready = batch.status === "PREVIEW"
    && summary.fixed_count === 137
    && summary.contribution_count === 116
    && summary.suspense_count === 21
    && summary.unresolved_count === 0
    && uniqueMatched === 116
    && !summary.is_stale;
  const unresolvedRows = value.rows.filter((row) => row.match_status === "UNRESOLVED");
  const manualRows = value.rows.filter((row) => row.match_status === "MANUAL");

  return <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-bold text-blue-950">116명 명단 계정과목 대조</h3>
        <p className="mt-1 text-sm text-blue-900">분담금 116건과 가수금 21건을 원본 ID 기준으로 확정해. 취소 원본도 이력 분류는 남기지만 현재 금액에는 포함하지 않아.</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-sm font-bold ${batch.status === "APPLIED" ? "bg-emerald-100 text-emerald-800" : "bg-white text-blue-900"}`}>
        {batch.status === "APPLIED" ? "적용 완료" : "미리보기"}
      </span>
    </div>

    <div className="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
      <Summary label="정액필증 원본" value={`${summary.fixed_count}건`} />
      <Summary label="이름 자동 일치" value={`${summary.exact_count}건`} />
      <Summary label="수동 대조" value={`${summary.manual_count}건`} />
      <Summary label="미해결" value={`${summary.unresolved_count}건`} warning={summary.unresolved_count > 0} />
      <Summary label="분담금" value={`${summary.contribution_count}건`} />
      <Summary label="가수금" value={`${summary.suspense_count}건`} />
    </div>

    {batch.status === "APPLIED" ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
      <Summary label="현재 유효 분담금" value={`${summary.active_contribution_count}건 · ${money(summary.contribution_amount)}`} />
      <Summary label="현재 유효 가수금" value={`${summary.active_suspense_count}건 · ${money(summary.suspense_amount)}`} />
    </div> : null}

    {summary.is_stale ? <p className="mt-4 rounded-xl bg-rose-100 p-3 text-sm font-semibold text-rose-800">대조 후 Ledger 원본 버전이 바뀌었어. 새 미리보기를 만들어 다시 확인해줘.</p> : null}

    {batch.status === "PREVIEW" && unresolvedRows.length ? <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
      <h4 className="font-bold">이름이 다른 {unresolvedRows.length}명 수동 대조</h4>
      <p className="mt-1 text-sm text-slate-600">이름만으로 확정하지 않고, 조합원 상태와 원본 ID를 확인해 한 명씩 연결해줘.</p>
      <div className="mt-3 space-y-3">
        {unresolvedRows.map((row) => <div className="grid gap-2 border-t border-slate-100 pt-3 lg:grid-cols-[minmax(10rem,0.7fr)_minmax(16rem,1.5fr)_auto] lg:items-end" key={row.sheet_row_number}>
          <div><span className="text-xs text-slate-500">시트 {row.sheet_row_number}행</span><strong className="block">{row.sheet_name_snapshot}</strong></div>
          <label className="text-sm font-semibold">ERP 정액필증 원본
            <select className={`${input} mt-1`} onChange={(event) => setSelections((current) => ({ ...current, [row.sheet_row_number]: event.target.value }))} value={selections[row.sheet_row_number] ?? ""}>
              <option value="">대조할 조합원을 선택해줘</option>
              {value.candidates.map((candidate) => <option key={candidate.source_root_recognition_id} value={candidate.source_root_recognition_id}>
                {candidate.member_name_snapshot} · {candidate.member_status ?? candidate.member_group ?? "상태 미확인"} · {candidate.status === "CANCELLED" ? "취소 원본" : "유효"}
              </option>)}
            </select>
          </label>
          <button className={secondary} disabled={pending || !selections[row.sheet_row_number]} onClick={() => run(
            () => updateFixedCertificateAssignmentMatch(batch.id, row.sheet_row_number, selections[row.sheet_row_number] || null),
            `${row.sheet_name_snapshot} 명단을 ERP 원본과 대조했어.`,
          )} type="button">연결</button>
        </div>)}
      </div>
    </div> : null}

    {batch.status === "PREVIEW" && manualRows.length ? <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-bold">수동 대조 {manualRows.length}건 확인·해제</summary>
      <div className="mt-3 space-y-2">{manualRows.map((row) => <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2" key={row.sheet_row_number}>
        <p className="text-sm"><strong>{row.sheet_name_snapshot}</strong> → {row.erp_name_snapshot}<span className="ml-2 text-xs text-slate-500">원본 ID {row.source_root_recognition_id}</span></p>
        <button className={secondary} disabled={pending} onClick={() => run(
          () => updateFixedCertificateAssignmentMatch(batch.id, row.sheet_row_number, null),
          `${row.sheet_name_snapshot} 수동 연결을 해제했어.`,
        )} type="button">연결 해제</button>
      </div>)}</div>
    </details> : null}

    {batch.status === "PREVIEW" ? <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <label className="font-bold">적용 사유
        <input className={`${input} mt-2`} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="116명 명단 대조 결과와 계정과목 분류 근거를 입력해줘." value={reason} />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className={`text-sm ${ready ? "font-semibold text-emerald-700" : "text-slate-600"}`}>
          {ready ? "116명 분담금 · 21명 가수금 · 원본 버전 검증 완료" : "116명 연결, 21명 잔여, 미해결 0건, 최신 원본 조건이 모두 맞아야 적용할 수 있어."}
        </p>
        <button className={primary} disabled={!canDecide || pending || !ready || reason.trim().length < 2} onClick={() => run(
          () => confirmFixedCertificateAccountAssignments(batch.id, reason, crypto.randomUUID()),
          "116명은 분담금, 나머지 21명은 가수금으로 계정과목 분류를 기록했어.",
        )} type="button">분담금 116건 · 가수금 21건 적용</button>
      </div>
    </div> : <p className="mt-4 rounded-xl bg-emerald-100 p-3 text-sm text-emerald-900">적용 사유: {batch.apply_reason}</p>}

    <p className="mt-3 text-xs text-blue-800"><a className="font-semibold underline" href={sourceUrl} rel="noreferrer" target="_blank">조합원연명부(116명) B4:B119</a> · 원본 이름과 Ledger 거래는 수정하지 않고 대조 결과와 적용 이력을 별도 보존해.</p>
    {message ? <p className="mt-3 text-sm font-semibold text-blue-950" role="status">{message}</p> : null}
  </section>;
}

function Summary({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={`rounded-xl border p-3 ${warning ? "border-amber-300 bg-amber-50" : "border-blue-100 bg-white"}`}>
    <p className="text-xs text-slate-500">{label}</p>
    <strong className="mt-1 block text-base">{value}</strong>
  </div>;
}
