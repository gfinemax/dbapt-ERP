"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { AdvanceDraft } from "./advance-settlement-repository";
import type {
  TrustOperatingPeriod,
  TrustOperatingWorkspace,
} from "./trust-operating-repository";

const money = (value: number | null) =>
  value === null ? "확인 필요" : `${Number(value).toLocaleString("ko-KR")}원`;

function PrintModal({
  label,
  children,
  onClose,
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return createPortal(
    <div
      aria-label={label}
      aria-modal="true"
      className="print-modal-shell fixed inset-0 z-[80] overflow-y-auto bg-slate-950/45 p-4 sm:p-8"
      role="dialog"
    >
      <div className="mx-auto w-full max-w-[210mm] bg-white shadow-2xl print:w-[170mm] print:max-w-none print:shadow-none">
        <div className="flex justify-end gap-2 border-b p-4 print:hidden">
          <button
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => window.print()}
            type="button"
          >
            브라우저 인쇄·PDF
          </button>
        </div>
        <article className="min-h-[257mm] p-[12mm] text-[11px] leading-relaxed text-slate-950 print:p-0">
          {children}
        </article>
      </div>
    </div>,
    document.body,
  );
}

function DocumentHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="border-b-2 border-slate-950 pb-5 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-slate-500">
        DAEBANG ERP
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-[0.12em]">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
    </header>
  );
}

function SummaryGrid({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="mt-6 grid grid-cols-2 border-l border-t border-slate-400">
      {items.map((item) => (
        <div
          className="grid min-h-11 grid-cols-[34mm_1fr] border-b border-r border-slate-400"
          key={item.label}
        >
          <dt className="flex items-center justify-center bg-slate-100 p-2 font-bold">
            {item.label}
          </dt>
          <dd className="flex items-center p-2 font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AdvanceSettlementPrintModal({
  draft,
  onClose,
}: {
  draft: AdvanceDraft;
  onClose: () => void;
}) {
  return (
    <PrintModal label="선지급 정산서 출력 미리보기" onClose={onClose}>
      <DocumentHeader
        subtitle="실제 선지급·사용·반납·추가 지급을 연결한 보관용 정산서"
        title="선지급 사용정산서"
      />
      <SummaryGrid
        items={[
          { label: "정산 제목", value: draft.title },
          { label: "처리 상태", value: draft.status },
          {
            label: "최초 실제 선지급",
            value: money(draft.totals.initial_paid),
          },
          {
            label: "실제 추가 지급",
            value: money(draft.totals.additional_paid),
          },
          { label: "실제 반납", value: money(draft.totals.returned) },
          { label: "사용 합계", value: money(draft.totals.draft_used) },
          { label: "정산 차액", value: money(draft.totals.balance) },
          { label: "작성 메모", value: draft.memo || "-" },
        ]}
      />
      <h2 className="mb-2 mt-7 text-base font-bold">사용 내역</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 p-2 text-left">사용일</th>
            <th className="border border-slate-400 p-2 text-left">내용</th>
            <th className="border border-slate-400 p-2 text-right">금액</th>
            <th className="border border-slate-400 p-2">증빙</th>
          </tr>
        </thead>
        <tbody>
          {draft.usage.map((usage) => (
            <tr key={`${usage.source_kind}:${usage.source_id}`}>
              <td className="border border-slate-400 p-2">
                {usage.used_on.slice(0, 10)}
              </td>
              <td className="border border-slate-400 p-2">{usage.title}</td>
              <td className="border border-slate-400 p-2 text-right">
                {money(usage.amount)}
              </td>
              <td className="border border-slate-400 p-2 text-center">
                {usage.evidence_file_id ? "연결" : "확인 필요"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-6 border-t pt-3 text-slate-600">
        이 문서는 지출 원본을 대체하지 않아. 각 사용 내역의 원본·증빙과 실제
        지급·반납 거래를 함께 보관해.
      </p>
    </PrintModal>
  );
}

export function TrustOperatingPrintModal({
  period,
  workspace,
  onClose,
}: {
  period: TrustOperatingPeriod;
  workspace: TrustOperatingWorkspace;
  onClose: () => void;
}) {
  const bank = workspace.bank_links.filter(
    (row) => row.period_id === period.id,
  );
  const usage = workspace.usage.filter((row) => row.period_id === period.id);
  const contract = workspace.contracts.find(
    (row) => row.id === period.contract_version_id,
  );
  return (
    <PrintModal label="월 운영비 정산서 출력 미리보기" onClose={onClose}>
      <DocumentHeader
        subtitle="신탁 월 운영비 요청·실수령·사용·반납·이월 대조표"
        title="월 운영비 정산서"
      />
      <SummaryGrid
        items={[
          { label: "귀속월", value: period.month.slice(0, 7) },
          { label: "처리 상태", value: period.status },
          { label: "계약", value: contract?.name ?? "계약 확인 필요" },
          {
            label: "신탁 접수번호",
            value: period.request_reference || "미등록",
          },
          { label: "요청액", value: money(period.totals.requested) },
          { label: "전월 이월", value: money(period.totals.opening) },
          { label: "실제 수령", value: money(period.totals.received) },
          { label: "사용액", value: money(period.totals.used) },
          { label: "실제 반납", value: money(period.totals.returned) },
          { label: "차월 이월·잔액", value: money(period.totals.balance) },
        ]}
      />
      <h2 className="mb-2 mt-7 text-base font-bold">실제 입·출금 연결</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 p-2">일자</th>
            <th className="border border-slate-400 p-2 text-left">구분·적요</th>
            <th className="border border-slate-400 p-2 text-right">금액</th>
            <th className="border border-slate-400 p-2 text-left">근거</th>
          </tr>
        </thead>
        <tbody>
          {bank.map((row) => (
            <tr key={`${row.kind}:${row.bank_transaction_id}`}>
              <td className="border border-slate-400 p-2">
                {row.transacted_at.slice(0, 10)}
              </td>
              <td className="border border-slate-400 p-2">
                {row.kind === "RECEIPT" ? "수령" : "반납"} · {row.description}
              </td>
              <td className="border border-slate-400 p-2 text-right">
                {money(row.amount)}
              </td>
              <td className="border border-slate-400 p-2">{row.reason}</td>
            </tr>
          ))}
          {!bank.length ? (
            <tr>
              <td
                className="border border-slate-400 p-3 text-center"
                colSpan={4}
              >
                연결된 실제 입·출금이 없어.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <h2 className="mb-2 mt-7 text-base font-bold">운영비 사용 내역</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-400 p-2 text-left">지출 원본</th>
            <th className="border border-slate-400 p-2 text-right">금액</th>
            <th className="border border-slate-400 p-2 text-left">연결 근거</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((row) => (
            <tr key={row.transaction_id}>
              <td className="border border-slate-400 p-2">{row.title}</td>
              <td className="border border-slate-400 p-2 text-right">
                {money(row.amount)}
              </td>
              <td className="border border-slate-400 p-2">{row.reason}</td>
            </tr>
          ))}
          {!usage.length ? (
            <tr>
              <td
                className="border border-slate-400 p-3 text-center"
                colSpan={3}
              >
                연결된 사용 내역이 없어.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="mt-6 border-t pt-3 text-slate-600">
        요청액과 실제 수령액은 별개야. 이 문서는 연결된 실제 거래와 지출 원본을
        기준으로 작성됐어.
      </p>
    </PrintModal>
  );
}
