import Link from "next/link";
import { ErpShell } from "@/components/erp-shell";
import { groupBankExpenseDraftManifest, summarizeBankExpenseDraftManifest } from "@/features/finance/bank-expense-draft-manifest";
import { loadBankExpenseDraftManifest } from "@/features/finance/bank-expense-draft-manifest-repository";
import { requireExpenseActor } from "@/features/finance/expense-authorization";
import { ReimbursementLogin } from "@/features/finance/reimbursement-login";

export const dynamic = "force-dynamic";

const defaultFrom = "2026-07-01";
const defaultThrough = "2026-10-31";

function safeDate(value: string | string[] | undefined, fallback: string) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
}

export default async function BankDraftManifestPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams ?? {};
  const from = safeDate(params.from, defaultFrom);
  const through = safeDate(params.through, defaultThrough);
  try {
    await requireExpenseActor();
  } catch (error) {
    return <ReimbursementLogin title="지출결의 작성 예정표" description="본인 계정으로 로그인해서 읽기 전용 예정표를 확인해줘." error={error instanceof Error ? error.message : "로그인이 필요해."} />;
  }
  let rows;
  try {
    rows = await loadBankExpenseDraftManifest({ from, through });
  } catch (error) {
    return <ErpShell activeDetailLabel="지출결의서 관리" activeLabel="회계·자금" activeWorkspaceLabel="전표·증빙"><main className="mx-auto max-w-5xl p-6"><p role="alert" className="rounded-xl border border-orange-300 bg-orange-50 p-4">{error instanceof Error ? error.message : "작성 예정표를 불러오지 못했어."}</p></main></ErpShell>;
  }
  const summary = summarizeBankExpenseDraftManifest(rows);
  const groups = groupBankExpenseDraftManifest(rows);
  return (
    <ErpShell activeDetailLabel="지출결의서 관리" activeLabel="회계·자금" activeWorkspaceLabel="전표·증빙">
      <main className="mx-auto flex max-w-[1600px] flex-col gap-6 p-5 lg:p-8">
        <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-6">
          <p className="text-sm font-semibold text-[var(--color-deep-cobalt)]">읽기 전용 · 운영 데이터 변경 없음</p>
          <h1 className="mt-2 text-3xl font-bold">지출결의 작성 예정표</h1>
          <p className="mt-3 text-[var(--color-stone)]">{from}부터 {through}까지 원천 통장거래일 기준이야. 묶음 후보는 UUID와 정확한 목적 문구까지만 제안하며, 승인근거·증빙·세무 기준을 확인하기 전에는 저장 대상이 아니야.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link className="rounded-full border bg-white px-4 py-2 font-semibold" href="/finance/expense-resolutions">지출결의 목록으로</Link>
            <Link className="rounded-full border bg-white px-4 py-2 font-semibold" href={`/finance/expense-resolutions/bank-draft-manifest?from=${from}&through=${through}`}>새로고침</Link>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="작성 예정표 요약">
          {[
            ["전체", `${summary.totalCount}건`],
            ["전체 금액", `${summary.totalAmount.toLocaleString("ko-KR")}원`],
            ["추가 검토", `${summary.reviewCount}건`],
            ["보류", `${summary.holdCount}건`],
            ["기존 연결", `${summary.existingLinkCount}건`],
          ].map(([label, value]) => <div className="rounded-xl border bg-white p-4" key={label}><p className="text-sm text-[var(--color-stone)]">{label}</p><p className="mt-1 text-xl font-bold">{value}</p></div>)}
        </section>

        <section className="rounded-2xl border bg-white p-5">
          <h2 className="text-xl font-bold">2건 이상 묶음 검토 후보</h2>
          <p className="mt-1 text-sm text-[var(--color-stone)]">{groups.length}개 그룹 · 자동 확정하지 않음</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {groups.map((group) => <article className="rounded-xl border p-4" key={group.key}>
              <p className="font-bold">{group.rows[0]?.accountSubjectName ?? "계정과목 확인"} · {group.rows[0]?.budgetName ?? "예산 확인"}</p>
              <p className="mt-1 text-sm">{group.count}건 · {group.amount.toLocaleString("ko-KR")}원</p>
              <p className="mt-2 text-xs text-[var(--color-stone)]">{group.rows[0]?.recommendationBasis}</p>
            </article>)}
            {!groups.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm">현재 조건에서 2건 이상인 묶음 검토 후보가 없어.</p> : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b p-5"><h2 className="text-xl font-bold">거래별 manifest</h2></div>
          <div className="overflow-x-auto">
            <table className="min-w-[1500px] text-left text-sm">
              <thead className="bg-slate-50"><tr>{["원천 거래일", "거래처·적요", "금액", "계정과목 UUID", "예산 UUID", "세부항목 UUID", "기존 결의·기안·전표", "추천/보류 근거", "상태"].map((label) => <th className="px-4 py-3" key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>
                {rows.map((row) => <tr className="border-t [content-visibility:auto]" key={row.bankTransactionId}>
                  <td className="whitespace-nowrap px-4 py-3">{row.sourceTransactionDate}</td>
                  <td className="max-w-xs px-4 py-3"><p className="font-semibold">{row.counterparty || "거래처 없음"}</p><p className="text-xs text-[var(--color-stone)]">{row.description}</p><p className="mt-1 font-mono text-[11px]">{row.bankTransactionId}</p></td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.amount.toLocaleString("ko-KR")}원</td>
                  <td className="max-w-52 break-all px-4 py-3"><p>{row.accountSubjectName || "미확정"}</p><p className="font-mono text-[11px]">{row.accountSubjectId || "-"}</p></td>
                  <td className="max-w-52 break-all px-4 py-3"><p>{row.budgetName || `${row.budgetCandidateCount}개 후보`}</p><p className="font-mono text-[11px]">{row.budgetId || "-"}</p></td>
                  <td className="max-w-52 break-all px-4 py-3"><p>{row.expenseDetailName || `${row.expenseDetailCandidateCount}개 후보`}</p><p className="font-mono text-[11px]">{row.expenseDetailId || "-"}</p></td>
                  <td className="px-4 py-3 text-xs"><p>{row.existingResolutionNo || row.duplicateResolutionNo || "결의 없음"}</p><p>{row.approvalDocumentId ? `기안 ${row.approvalDocumentId}` : "기안 없음"}</p><p>{row.voucherNo || "전표 없음"}</p></td>
                  <td className="max-w-sm px-4 py-3 text-xs">{row.recommendationBasis}</td>
                  <td className="whitespace-nowrap px-4 py-3"><span className="rounded-full border px-2 py-1 font-semibold">{row.eligibility === "REVIEW_REQUIRED" ? "추가 검토" : row.eligibility === "EXISTING_LINK" ? "기존 연결" : row.holdReason || "보류"}</span></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </ErpShell>
  );
}
