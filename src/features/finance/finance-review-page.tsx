import Link from "next/link";
import { ErpShell } from "@/components/erp-shell";
import { reimbursementIdentity } from "./reimbursement-auth";
import { koreaDate } from "./reimbursement-domain";
import { ReimbursementLogin } from "./reimbursement-page";
import { reimbursementLogout } from "@/app/finance/reimbursements/actions";
import { loadFinanceReview, reviewMonth, reviewPage, reviewPageSize, reviewEvidenceSource, type ReviewKind, type ReviewResult } from "./finance-review-repository";

const titles: Record<ReviewKind, string> = { evidence: "증빙자료 관리", "tax-documents": "세금계산서·계산서", "month-close": "월 마감", collections: "분담금 수납관리", refunds: "환급관리" };
const descriptions: Record<ReviewKind, string> = {
  evidence: "원본 종류를 선택해서 현재 조직의 지출결의·개인 대납·신탁 및 지급 증빙을 확인합니다. 각 원본의 파일과 연결 관계를 유지합니다.",
  "tax-documents": "등록된 증빙 중 세금계산서·계산서로 분류된 원본입니다. 발행·국세청 전송·매입세액 확정 기능은 포함하지 않습니다.",
  "month-close": "지출결의의 전표·증빙 미비 또는 회계일 미등록 건을 점검합니다. 이 목록만으로 전체 회계 마감이 완료되지는 않습니다.",
  collections: "분담금 원장 연결에 필요한 조합원 고유 ID, 수납 원본 ID, 부과·입금 배분 기준이 아직 설정되지 않았습니다. 확인되지 않은 수납액은 집계하지 않습니다.",
  refunds: "계좌 거래에서 환급 대상으로 분류한 실제 기록을 확인합니다. 대상자·환급 사유·원수납 연결과 지급 완료를 확정한 환급 원장은 아직 연결되지 않았습니다.",
};
export async function FinanceReviewPage({ kind, query }: { kind: ReviewKind; query: { month?: string; page?: string; source?: string; scope?: string } }) {
  const month = reviewMonth(query.month, koreaDate());
  const page = reviewPage(query.page);
  const source = reviewEvidenceSource(query.source);
  const missingDate = query.scope === "missing-date";
  let member: Awaited<ReturnType<typeof reimbursementIdentity>> = null;
  let result: ReviewResult | null = null;
  let error: string | undefined;
  try { member = await reimbursementIdentity(); if (member) result = await loadFinanceReview(member, kind, month, page, source, missingDate); }
  catch (cause) { error = cause instanceof Error ? cause.message : "자료를 불러오지 못했습니다."; }
  const base = `/finance/${kind}`;
  const pageHref = (target: number) => `${base}?page=${target}&month=${month}&source=${source}&scope=${missingDate ? "missing-date" : "month"}`;
  return <ErpShell activeLabel="회계/자금" activeWorkspaceLabel="전표·증빙관리" activeDetailLabel={titles[kind]} userLabel={member?.display_name ?? "로그인 필요"} logoutAction={reimbursementLogout}>
    <div className="mx-auto max-w-6xl space-y-5">
      <div><p className="text-sm text-slate-500">회계/자금 · 전표·증빙관리</p><h1 className="mt-2 text-2xl font-bold">{titles[kind]}</h1><p className="mt-2 text-sm text-slate-600">{descriptions[kind]}</p></div>
      {!member ? <ReimbursementLogin error={error} title={titles[kind]} description="조직의 자료를 확인하려면 본인 계정으로 로그인해줘." /> : error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4">{error}</p> : result ? <>
        {kind === "collections" || kind === "refunds" ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold">원장 연결 설정 필요</h2><p className="mt-2 text-sm">기존 조합원·계좌 거래 자료는 그대로 유지합니다. 고유 ID와 담당자 확인으로 원장을 연결한 뒤 수납·환급 처리 기능을 제공할 수 있습니다.</p><div className="mt-3 flex gap-4 text-sm underline"><Link href="/members">조합원 관리</Link><Link href="/finance/bank-transactions">계좌거래 매칭</Link></div></section> : null}
        {kind === "evidence" ? <form className="flex gap-3"><label>원본 종류<select name="source" defaultValue={source} className="ml-2 rounded border p-2"><option value="RESOLUTION">지출결의 증빙</option><option value="PERSONAL">개인 대납 증빙</option><option value="TRUST">신탁·지급 증빙</option></select></label><button className="rounded border px-3">조회</button></form> : null}<a href={pageHref(page)} className="inline-block text-sm underline">현재 조건 다시 조회</a>{kind === "month-close" ? <><form className="flex flex-wrap items-end gap-3"><label className="text-sm">회계월<input name="month" type="month" defaultValue={month} className="ml-2 rounded border p-2" required /></label><label>점검 범위<select name="scope" defaultValue={missingDate ? "missing-date" : "month"} className="ml-2 rounded border p-2"><option value="month">선택월 전표·증빙 점검</option><option value="missing-date">회계일 미등록 · 전체 기간</option></select></label><button className="rounded bg-slate-800 px-4 py-2 text-sm text-white">점검 조회</button></form><p className="rounded-lg bg-slate-100 p-3 text-sm">회계기간 잠금·재개방은 회계 정책과 권한 설정이 필요합니다. 개인 경비의 기존 접수·마감은 <a className="underline" href={`/finance/reimbursements?month=${month}`}>대납·선지급 정산의 월별 정산</a>에서 유지합니다.</p></> : null}
        {kind !== "collections" ? <section className="overflow-hidden rounded-xl border bg-white"><div className="border-b p-4 text-sm font-semibold">{kind === "month-close" ? "점검 대상" : kind === "refunds" ? "환급 검토 대상 거래" : "등록된 증빙"} {result.count === null ? "건수 확인 필요" : `${result.count.toLocaleString("ko-KR")}건`}</div>{result.rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">일자</th><th className="p-3">내용</th><th className="p-3">분류·상태</th><th className="p-3">확인</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.id} className="border-t"><td className="p-3">{row.date ? row.date.slice(0, 10) : "일자 미등록"}</td><td className="p-3">{row.title}{row.deposit !== undefined ? <span className="mt-1 block">입금 {row.deposit.toLocaleString("ko-KR")}원 · 출금 {row.withdrawal?.toLocaleString("ko-KR")}원</span> : null}{row.amount !== undefined ? <span className="mt-1 block text-slate-500">{row.amount.toLocaleString("ko-KR")}원</span> : null}</td><td className="p-3">{row.status}</td><td className="p-3">{row.href ? <a className="font-semibold text-blue-700 underline" href={row.href}>{kind === "month-close" ? "지출 확인" : "원본 다운로드"}</a> : "분류 기록"}{row.sourceHref ? <a className="ml-3 underline" href={row.sourceHref}>연결 원본 확인</a> : null}</td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-slate-500">현재 조건에 해당하는 기록이 없습니다.</p>}<nav aria-label="목록 페이지" className="flex items-center justify-between border-t p-3 text-sm">{page > 1 ? <a href={pageHref(page - 1)}>이전</a> : <span />}<span>{page}페이지</span>{result.count !== null && page * reviewPageSize < result.count ? <a href={pageHref(page + 1)}>다음</a> : <span />}</nav></section> : null}
      </> : null}
    </div>
  </ErpShell>;
}
