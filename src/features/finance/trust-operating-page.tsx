"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { executeTrustOperating } from "@/app/finance/trust/operating-actions";
import type {
  TrustOperatingCommand,
  TrustOperatingPeriod,
  TrustOperatingWorkspace,
} from "./trust-operating-repository";
import { TrustOperatingPrintModal } from "./finance-print-modal";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const field =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
const button =
  "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
const money = (value: number) => `${Number(value).toLocaleString("ko-KR")}원`;
const statusLabels = {
  DRAFT: "요청 작성중",
  SUBMITTED: "수령 대기",
  OPEN: "사용·정산 중",
  SETTLED: "월 정산 완료",
} as const;

export function TrustOperatingPage({
  workspace,
  mode,
}: {
  workspace: TrustOperatingWorkspace;
  mode: "funds" | "settlement";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const keys = useRef(new Map<string, string>());
  const current =
    workspace.periods.find((period) => period.status !== "SETTLED") ??
    workspace.periods[0];
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [printing, setPrinting] = useState<TrustOperatingPeriod | null>(null);
  const canApprove = workspace.viewer.permissions.some(
    (permission) => permission === "ADMIN" || permission === "APPROVE",
  );
  const canPay = workspace.viewer.permissions.some(
    (permission) => permission === "ADMIN" || permission === "PAY",
  );
  const canClose = workspace.viewer.permissions.some(
    (permission) => permission === "ADMIN" || permission === "CLOSE",
  );

  function command(
    kind: TrustOperatingCommand,
    input: Record<string, unknown>,
    success: string,
  ) {
    if (inFlight.current) return;
    const signature = JSON.stringify([kind, input]);
    const key = keys.current.get(signature) ?? crypto.randomUUID();
    keys.current.set(signature, key);
    inFlight.current = true;
    setError("");
    setMessage("");
    start(async () => {
      try {
        await executeTrustOperating(kind, input, key);
        keys.current.delete(signature);
        setMessage(success);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "처리하지 못했어.");
      } finally {
        inFlight.current = false;
      }
    });
  }

  function createPeriod(form: FormData) {
    command(
      "PERIOD_SAVE",
      {
        month: `${form.get("month")}-01`,
        contract_version_id: String(form.get("contract")),
        title: String(form.get("title")),
        requested_amount: Number(form.get("amount")),
        request_reference: String(form.get("reference")),
      },
      "월 운영비 요청 초안을 저장했어.",
    );
  }
  function linkBank(form: FormData, kind: "RECEIPT" | "RETURN") {
    if (!current) return;
    command(
      "BANK_LINK",
      {
        period_id: current.id,
        bank_transaction_id: String(form.get("bank")),
        kind,
        reason: String(form.get("reason")),
      },
      kind === "RECEIPT"
        ? "실제 수령 거래를 연결했어."
        : "실제 반납 거래를 연결했어.",
    );
  }
  function linkUsage(form: FormData) {
    if (!current) return;
    const candidate = workspace.usage_candidates.find(
      (item) => item.transaction_id === form.get("transaction"),
    );
    if (!candidate) {
      setError("운영비 사용 원본을 다시 선택해줘.");
      return;
    }
    command(
      "USAGE_LINK",
      {
        period_id: current.id,
        transaction_id: candidate.transaction_id,
        signature: candidate.signature,
        reason: String(form.get("reason")),
      },
      "운영비 사용내역을 연결했어.",
    );
  }

  return (
    <div className="space-y-5">
      <header className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-blue-700">신탁 집행관리</p>
            <h1 className="mt-1 text-3xl font-bold">
              {mode === "funds" ? "월 운영비 요청·수령" : "운영비 사용정산"}
            </h1>
            <p className="mt-2 text-slate-600">
              월 운영비 선교부와 실제 입금, 사용, 반납, 이월을 같은 원장으로
              대조해.
            </p>
          </div>
          <Link className={secondary} href="/finance/workflow-settings">
            신탁 집행 기준
          </Link>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="신탁 집행 구분">
          <Link
            className={mode === "funds" ? button : secondary}
            href="/finance/trust?view=operating-funds"
          >
            요청·수령
          </Link>
          <Link
            className={mode === "settlement" ? button : secondary}
            href="/finance/trust?view=operating-settlement"
          >
            사용정산
          </Link>
          <Link className={secondary} href="/finance/trust?view=business">
            사업비 집행요청
          </Link>
        </nav>
      </header>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          {message}
        </p>
      ) : null}
      {!workspace.contracts.length ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold">신탁 집행 기준 설정 필요</h2>
          <p className="mt-2 text-sm">
            운영계좌 집행과 월 운영비 선교부가 확인된 계약 버전을 먼저 등록해줘.
          </p>
          <Link
            className={`${secondary} mt-3 inline-flex`}
            href="/finance/workflow-settings"
          >
            신탁 집행 기준 열기
          </Link>
        </section>
      ) : null}
      {mode === "funds" &&
      !workspace.periods.some((period) => period.status !== "SETTLED") &&
      canApprove &&
      workspace.contracts.length ? (
        <form action={createPeriod} className={card}>
          <h2 className="text-xl font-bold">새 월 운영비 요청</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label>
              귀속월
              <input className={field} name="month" type="month" required />
            </label>
            <label>
              신탁 계약
              <select className={field} name="contract" required>
                {workspace.contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              요청 제목
              <input className={field} name="title" required />
            </label>
            <label>
              요청 금액
              <input
                className={field}
                name="amount"
                type="number"
                min="0"
                step="1"
                required
              />
            </label>
            <label className="sm:col-span-2">
              신탁 요청·접수번호
              <input className={field} name="reference" />
            </label>
          </div>
          <button className={`${button} mt-4`} disabled={pending}>
            요청 초안 저장
          </button>
        </form>
      ) : null}
      <section className={card}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">월 운영비 원장</h2>
          {current ? (
            <button
              className={secondary}
              onClick={() => setPrinting(current)}
              type="button"
            >
              월 정산서 출력
            </button>
          ) : null}
        </div>
        {workspace.periods.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">귀속월·상태</th>
                  <th>요청</th>
                  <th>전월 이월</th>
                  <th>실제 수령</th>
                  <th>사용</th>
                  <th>반납</th>
                  <th>잔액</th>
                  <th>처리</th>
                </tr>
              </thead>
              <tbody>
                {workspace.periods.map((period) => (
                  <PeriodRow
                    key={period.id}
                    period={period}
                    canApprove={canApprove}
                    pending={pending}
                    submit={() =>
                      command(
                        "PERIOD_SUBMIT",
                        { id: period.id, lock_version: period.lock_version },
                        "월 운영비 요청을 제출했어.",
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            등록된 월 운영비 요청이 없어.
          </p>
        )}
      </section>
      {current && mode === "funds" && current.status !== "DRAFT" ? (
        <section className={card}>
          <h2 className="text-xl font-bold">실제 운영비 수령</h2>
          <p className="mt-2 text-sm text-slate-600">
            요청금액이 아니라 운영계좌의 실제 입금 거래를 연결해.
          </p>
          {canPay ? (
            <form
              action={(form) => linkBank(form, "RECEIPT")}
              className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            >
              <label>
                입금 거래
                <select className={field} name="bank" required>
                  <option value="">선택</option>
                  {workspace.bank_candidates
                    .filter((row) => Number(row.deposit_amount) > 0)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.transacted_at.slice(0, 10)} · {row.description} ·{" "}
                        {money(row.deposit_amount)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                연결 근거
                <input className={field} name="reason" required />
              </label>
              <button className={button} disabled={pending}>
                수령 연결
              </button>
            </form>
          ) : (
            <p className="mt-3 text-sm">
              지급 담당자가 실제 입금 거래를 연결할 수 있어.
            </p>
          )}
        </section>
      ) : null}
      {current && mode === "settlement" && current.status !== "DRAFT" ? (
        <>
          <section className={card}>
            <h2 className="text-xl font-bold">운영비 사용 연결</h2>
            <p className="mt-2 text-sm text-slate-600">
              운영계좌 경로와 실제 지급이 확인된 지출만 연결돼.
            </p>
            {canApprove ? (
              <form
                action={linkUsage}
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              >
                <label>
                  지출 원본
                  <select className={field} name="transaction" required>
                    <option value="">선택</option>
                    {workspace.usage_candidates
                      .filter(
                        (row) =>
                          row.contract_version_id ===
                          current.contract_version_id,
                      )
                      .map((row) => (
                        <option
                          key={row.transaction_id}
                          value={row.transaction_id}
                        >
                          {row.title} · 실제 {money(row.paid)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  연결 근거
                  <input className={field} name="reason" required />
                </label>
                <button className={button} disabled={pending}>
                  사용 연결
                </button>
              </form>
            ) : null}
            <ul className="mt-4 space-y-2">
              {workspace.usage
                .filter((row) => row.period_id === current.id)
                .map((row) => (
                  <li
                    className="rounded-lg border p-3 text-sm"
                    key={row.transaction_id}
                  >
                    {row.title} · {money(row.amount)}
                    {row.source_revision !== row.current_revision ||
                    row.source_signature !== row.current_signature
                      ? " · 원본 변경 재검토 필요"
                      : ""}
                  </li>
                ))}
            </ul>
          </section>
          <section className={card}>
            <h2 className="text-xl font-bold">잔액 반납·월 정산</h2>
            {canPay ? (
              <form
                action={(form) => linkBank(form, "RETURN")}
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              >
                <label>
                  반납 출금 거래
                  <select className={field} name="bank" required>
                    <option value="">선택</option>
                    {workspace.bank_candidates
                      .filter((row) => Number(row.withdrawal_amount) > 0)
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.transacted_at.slice(0, 10)} · {row.description} ·{" "}
                          {money(row.withdrawal_amount)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  반납 근거
                  <input className={field} name="reason" required />
                </label>
                <button className={secondary} disabled={pending}>
                  반납 연결
                </button>
              </form>
            ) : null}
            <p className="mt-4 text-sm">
              현재 잔액 {money(current.totals.balance)} · 정산 후 남은 금액은
              다음 달 이월액으로 보존돼.
            </p>
            {canClose ? (
              <button
                className={`${button} mt-3`}
                disabled={
                  pending ||
                  current.totals.received <= 0 ||
                  current.totals.balance < 0
                }
                onClick={() =>
                  command(
                    "PERIOD_SETTLE",
                    {
                      id: current.id,
                      lock_version: current.lock_version,
                      reason: "월 운영비 사용·반납 대조 완료",
                    },
                    "월 운영비 정산을 완료했어.",
                  )
                }
              >
                월 정산 완료
              </button>
            ) : null}
          </section>
        </>
      ) : null}
      {printing ? (
        <TrustOperatingPrintModal
          onClose={() => setPrinting(null)}
          period={printing}
          workspace={workspace}
        />
      ) : null}
    </div>
  );
}

function PeriodRow({
  period,
  canApprove,
  pending,
  submit,
}: {
  period: TrustOperatingPeriod;
  canApprove: boolean;
  pending: boolean;
  submit: () => void;
}) {
  return (
    <tr className="border-t">
      <td className="p-2 font-semibold">
        {period.month.slice(0, 7)}
        <span className="mt-1 block text-xs font-normal text-slate-600">
          {statusLabels[period.status]}
        </span>
      </td>
      <td>{money(period.totals.requested)}</td>
      <td>{money(period.totals.opening)}</td>
      <td>{money(period.totals.received)}</td>
      <td>{money(period.totals.used)}</td>
      <td>{money(period.totals.returned)}</td>
      <td className="font-semibold">{money(period.totals.balance)}</td>
      <td>
        {period.status === "DRAFT" && canApprove ? (
          <button className={secondary} disabled={pending} onClick={submit}>
            요청 제출
          </button>
        ) : (
          period.request_reference || "-"
        )}
      </td>
    </tr>
  );
}
