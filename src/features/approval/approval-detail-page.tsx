import Link from "next/link";
import { ErpShell } from "@/components/erp-shell";
import {
  closeApprovalAction,
  createContractAction,
  createContractPaymentExpenseAction,
  createLinkedExpenseAction,
  createMeetingAgendaAction,
  decideApprovalAction,
  decideMeetingAgendaAction,
  openApprovalAttachmentAction,
  updateApprovalAction,
} from "@/app/approval/actions";
import {
  approvalStatusLabels,
  approvalTypeLabels,
  type ApprovalDocument,
} from "./approval-domain";

export function ApprovalDetailPage({
  document,
}: {
  document: ApprovalDocument;
}) {
  const current = document.approvalSteps.find(
    (step) => step.status === "PENDING",
  );
  return (
    <ErpShell activeLabel="기안·결재">
      <main className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-[28px] border border-[var(--color-soft-border)] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[var(--color-deep-cobalt)]">
                {document.documentNo} ·{" "}
                {approvalTypeLabels[document.documentType]}
              </p>
              <h1 className="mt-2 text-3xl font-bold">{document.title}</h1>
            </div>
            <Link
              className="rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-bold"
              href="/approval"
            >
              목록
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Status
              label="결재"
              value={approvalStatusLabels[document.approvalStatus]}
            />
            <Status
              label="의결"
              value={
                document.meetingStatus === "REQUIRED"
                  ? "의결 필요"
                  : document.meetingStatus === "APPROVED"
                    ? "의결 완료"
                    : "대상 아님"
              }
            />
            <Status
              label="집행"
              value={
                document.executionStatus === "EXECUTION_READY"
                  ? "집행 가능"
                  : document.executionStatus === "BUDGET_RESERVED"
                    ? "예산 예약"
                    : "대기"
              }
            />
          </div>
        </header>
        <nav
          className="flex flex-wrap gap-2 rounded-2xl border border-[var(--color-soft-border)] bg-white p-3"
          aria-label="기안 상세 영역"
        >
          {[
            "기안내용",
            "결재",
            "예산·회계",
            "회의·의결",
            "계약·지급",
            "첨부파일",
            "변경이력",
          ].map((label) => (
            <a
              className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-2 text-xs font-bold"
              href={`#${label}`}
              key={label}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="space-y-5">
            <div id="기안내용">
              <Card title="기안내용">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Item
                    label="기안자"
                    value={`${document.drafterLabel} · ${document.departmentLabel}`}
                  />
                  <Item label="목적" value={document.purpose} />
                  <Item
                    label="거래처"
                    value={document.counterpartyName ?? "미지정"}
                  />
                  <Item
                    label="예산 항목"
                    value={document.budgetItem ?? "미지정"}
                  />
                  <Item
                    label="금액"
                    value={`${document.amount.toLocaleString("ko-KR")}원`}
                  />
                  <Item
                    label="예산 예약"
                    value={`${document.reservedAmount.toLocaleString("ko-KR")}원`}
                  />
                </dl>
                <p className="mt-5 whitespace-pre-wrap rounded-xl bg-[var(--color-cloud-veil)] p-4 text-sm leading-7">
                  {document.body || "본문 없음"}
                </p>
              </Card>
            </div>
            <div id="예산·회계">
              <Card title="예산·회계">
                <p className="text-sm">
                  승인금액 {document.amount.toLocaleString("ko-KR")}원 ·
                  집행예정액 {document.reservedAmount.toLocaleString("ko-KR")}원
                </p>
                {document.expenseResolutionId ? (
                  <Link
                    className="mt-3 inline-block font-bold text-[var(--color-deep-cobalt)]"
                    href="/finance/exp"
                  >
                    연결된 지출결의서 보기 →
                  </Link>
                ) : null}
              </Card>
            </div>
            <div id="회의·의결">
              <Card title="회의·의결">
                <p className="text-sm">의결 상태: {document.meetingStatus}</p>
                {document.recommendedMeetingBody ? (
                  <dl className="mt-3 grid gap-3 rounded-xl bg-[var(--color-cloud-veil)] p-4 sm:grid-cols-2">
                    <Item
                      label="권고 의결기관"
                      value={document.recommendedMeetingBody}
                    />
                    <Item
                      label="권고 사유"
                      value={document.recommendationReason ?? "규칙 기준"}
                    />
                    <Item
                      label="규정 근거"
                      value={document.regulationReference ?? "미지정"}
                    />
                  </dl>
                ) : null}
                <p className="mt-2 text-xs text-[var(--color-stone)]">
                  {document.meetingId
                    ? "연결된 회의 안건이 있어."
                    : document.meetingStatus === "REQUIRED"
                      ? "안건 생성이 필요해."
                      : "의결 대상이 아니야."}
                </p>
              </Card>
            </div>
            <div id="계약·지급">
              <Card title="계약·지급">
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Item
                    label="계약기간"
                    value={
                      document.contractStartDate || document.contractEndDate
                        ? `${document.contractStartDate ?? "-"} ~ ${document.contractEndDate ?? "-"}`
                        : "미지정"
                    }
                  />
                  <Item
                    label="지급조건"
                    value={document.contractPaymentTerms ?? "미지정"}
                  />
                </dl>
                {document.paymentSchedule?.length ? (
                  <table className="mt-4 w-full text-sm">
                    <thead>
                      <tr>
                        <th className="py-2 text-left">지급일</th>
                        <th className="py-2 text-left">금액</th>
                        <th className="py-2 text-left">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {document.paymentSchedule.map((item, index) => (
                        <tr
                          className="border-t border-[var(--color-soft-border)]"
                          key={`${item.dueDate}-${index}`}
                        >
                          <td className="py-2">{item.dueDate}</td>
                          <td className="py-2">
                            {item.amount.toLocaleString("ko-KR")}원
                          </td>
                          <td className="py-2">{item.memo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="mt-3 text-sm text-[var(--color-stone)]">
                    분할지급 일정이 없어.
                  </p>
                )}
              </Card>
            </div>
            <div id="첨부파일">
              <Card title="첨부파일">
                {document.attachments?.length ? (
                  <ul className="space-y-2">
                    {document.attachments.map((file) => (
                      <li
                        className="flex items-center justify-between gap-3 text-sm"
                        key={file.id}
                      >
                        <span>
                          {file.fileName} · {(file.fileSize / 1024).toFixed(1)}
                          KB
                        </span>
                        <form action={openApprovalAttachmentAction}>
                          <input
                            name="attachmentId"
                            type="hidden"
                            value={file.id}
                          />
                          <button className="rounded-full border border-[var(--color-soft-border)] px-3 py-1 text-xs font-bold">
                            열기
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-stone)]">
                    첨부파일이 없어.
                  </p>
                )}
              </Card>
            </div>
            <div id="변경이력">
              <Card title="변경이력">
                <ol className="space-y-3">
                  {document.auditLogs?.map((log) => (
                    <li
                      className="border-l-2 border-[var(--color-soft-border)] pl-3 text-sm"
                      key={log.id}
                    >
                      <b>{log.actionType}</b> · {log.actorLabel}
                      <p className="text-xs text-[var(--color-stone)]">
                        {new Date(log.createdAt).toLocaleString("ko-KR")}{" "}
                        {log.comment}
                      </p>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </section>
          <aside className="space-y-5">
            {document.contractId ? (
              <Card title="계약 누적 지급">
                <p className="text-sm font-bold">
                  계약금액{" "}
                  {(document.contractAmount ?? document.amount).toLocaleString(
                    "ko-KR",
                  )}
                  원
                </p>
                <p className="mt-1 text-sm">
                  누적 지급액{" "}
                  {(document.contractPaidAmount ?? 0).toLocaleString("ko-KR")}원
                  · 잔액{" "}
                  {(
                    (document.contractAmount ?? document.amount) -
                    (document.contractPaidAmount ?? 0)
                  ).toLocaleString("ko-KR")}
                  원
                </p>
                {document.contractPayments?.map((payment) => (
                  <form
                    action={createContractPaymentExpenseAction}
                    className="mt-3 rounded-xl border border-[var(--color-soft-border)] p-3"
                    key={payment.id}
                  >
                    <input name="id" type="hidden" value={document.id} />
                    <input name="paymentId" type="hidden" value={payment.id} />
                    <input
                      name="actorLabel"
                      type="hidden"
                      value={document.drafterLabel}
                    />
                    <p className="text-xs font-bold">
                      {payment.dueDate ?? "일자 미정"} ·{" "}
                      {payment.amount.toLocaleString("ko-KR")}원
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-stone)]">
                      {payment.status}
                    </p>
                    {payment.status === "SCHEDULED" ? (
                      <button className="mt-2 w-full rounded-full bg-[var(--color-deep-cobalt)] px-3 py-2 text-xs font-bold text-white">
                        지출결의서 생성
                      </button>
                    ) : payment.expenseResolutionId ? (
                      <Link
                        className="mt-2 inline-block text-xs font-bold text-[var(--color-deep-cobalt)]"
                        href="/finance/exp"
                      >
                        결의서 보기 →
                      </Link>
                    ) : null}
                  </form>
                ))}
              </Card>
            ) : null}
            <Card title="결재선">
              <ol className="space-y-3">
                {document.approvalSteps.map((step) => (
                  <li
                    className="flex items-center justify-between rounded-xl border border-[var(--color-soft-border)] p-3"
                    key={step.order}
                  >
                    <div>
                      <p className="text-sm font-bold">
                        {step.order}. {step.approverLabel}
                      </p>
                      <p className="text-xs text-[var(--color-stone)]">
                        {step.approverRole}
                      </p>
                    </div>
                    <span className="text-xs font-bold">
                      {step.status === "PENDING"
                        ? "결재대기"
                        : step.status === "APPROVED"
                          ? "승인"
                          : step.status === "REJECTED"
                            ? "반려"
                            : "대기"}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
            {current ? (
              <Card title="현재 결재 처리">
                <form action={decideApprovalAction} className="space-y-3">
                  <input name="id" type="hidden" value={document.id} />
                  <label className="text-sm font-semibold">
                    처리자
                    <input
                      className="mt-1 w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2"
                      name="actorLabel"
                      defaultValue={current.approverLabel}
                      required
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    의견
                    <textarea
                      className="mt-1 min-h-20 w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2"
                      name="comment"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="rounded-full bg-[var(--color-deep-cobalt)] px-4 py-2 text-sm font-bold text-white"
                      name="decision"
                      value="APPROVE"
                    >
                      승인
                    </button>
                    <button
                      className="rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white"
                      name="decision"
                      value="REJECT"
                    >
                      반려
                    </button>
                  </div>
                </form>
              </Card>
            ) : null}
            {document.approvalStatus === "APPROVED" &&
            (document.meetingStatus === "NOT_REQUIRED" ||
              document.meetingStatus === "APPROVED") &&
            (document.documentType !== "CONTRACT" ||
              !document.paymentSchedule?.length) ? (
              <Card title="회계 연결">
                <form action={createLinkedExpenseAction} className="space-y-3">
                  <input name="id" type="hidden" value={document.id} />
                  <label className="text-sm font-semibold">
                    처리자
                    <input
                      className="mt-1 w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2"
                      name="actorLabel"
                      defaultValue={document.drafterLabel}
                      required
                    />
                  </label>
                  <button className="w-full rounded-full bg-[var(--color-pressed-charcoal)] px-4 py-2 text-sm font-bold text-white">
                    지출결의서 생성
                  </button>
                </form>
              </Card>
            ) : null}
            {document.meetingStatus === "REQUIRED" ? (
              <Card title="회의·의결">
                <form action={createMeetingAgendaAction} className="space-y-3">
                  <input name="id" type="hidden" value={document.id} />
                  <input
                    name="actorLabel"
                    type="hidden"
                    value={document.drafterLabel}
                  />
                  <select
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    name="meetingBody"
                  >
                    <option value="BOARD">이사회</option>
                    <option value="DELEGATES">대의원회</option>
                    <option value="GENERAL_ASSEMBLY">총회</option>
                  </select>
                  <button className="w-full rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-bold">
                    안건 생성
                  </button>
                </form>
              </Card>
            ) : null}
            {document.meetingStatus === "SCHEDULED" ? (
              <Card title="의결 결과 등록">
                <form action={decideMeetingAgendaAction} className="space-y-2">
                  <input name="id" type="hidden" value={document.id} />
                  <input
                    name="actorLabel"
                    type="hidden"
                    value={document.drafterLabel}
                  />
                  <input
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    name="meetingDate"
                    type="date"
                    required
                  />
                  <input
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    name="round"
                    placeholder="회차"
                    required
                  />
                  <input
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    name="agendaNo"
                    placeholder="안건번호"
                    required
                  />
                  <select
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    name="result"
                  >
                    <option value="APPROVED">가결</option>
                    <option value="REJECTED">부결</option>
                    <option value="DEFERRED">보류</option>
                  </select>
                  <textarea
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    name="conditions"
                    placeholder="부대조건"
                  />
                  <button className="w-full rounded-full bg-[var(--color-deep-cobalt)] px-4 py-2 text-sm font-bold text-white">
                    의결 저장
                  </button>
                </form>
              </Card>
            ) : null}
            {document.documentType === "CONTRACT" &&
            document.approvalStatus === "APPROVED" &&
            (document.meetingStatus === "NOT_REQUIRED" ||
              document.meetingStatus === "APPROVED") &&
            !document.contractId ? (
              <Card title="계약 연결">
                <form action={createContractAction} className="space-y-2">
                  <input name="id" type="hidden" value={document.id} />
                  <input
                    name="actorLabel"
                    type="hidden"
                    value={document.drafterLabel}
                  />
                  <textarea
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    name="paymentTerms"
                    placeholder="지급조건"
                    required
                  />
                  <button className="w-full rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-bold">
                    계약 생성·연결
                  </button>
                </form>
              </Card>
            ) : null}
            {!["WITHDRAWN", "CANCELLED"].includes(document.approvalStatus) ? (
              <Card title="수정·변경통제">
                <form action={updateApprovalAction} className="space-y-2">
                  <input name="id" type="hidden" value={document.id} />
                  <input
                    name="actorLabel"
                    type="hidden"
                    value={document.drafterLabel}
                  />
                  <input
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    defaultValue={document.title}
                    name="title"
                  />
                  <input
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    defaultValue={document.amount}
                    min="0"
                    name="amount"
                    type="number"
                  />
                  <input
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    defaultValue={document.counterpartyName}
                    name="counterpartyName"
                    placeholder="거래처"
                  />
                  <input
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    defaultValue={document.budgetItem}
                    name="budgetItem"
                    placeholder="예산계정"
                  />
                  <button className="w-full rounded-full border border-[var(--color-soft-border)] px-4 py-2 text-sm font-bold">
                    수정 저장
                  </button>
                </form>
                <form action={closeApprovalAction} className="mt-4 space-y-2">
                  <input name="id" type="hidden" value={document.id} />
                  <input
                    name="actorLabel"
                    type="hidden"
                    value={document.drafterLabel}
                  />
                  <input
                    className="w-full rounded-xl border border-[var(--color-soft-border)] px-3 py-2 text-sm"
                    name="reason"
                    placeholder="회수·취소 사유"
                    required
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className="rounded-full bg-[var(--color-cloud-veil)] px-3 py-2 text-xs font-bold"
                      name="action"
                      value="WITHDRAWN"
                    >
                      회수
                    </button>
                    <button
                      className="rounded-full bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                      name="action"
                      value="CANCELLED"
                    >
                      취소
                    </button>
                  </div>
                </form>
              </Card>
            ) : null}
          </aside>
        </div>
      </main>
    </ErpShell>
  );
}
function Card({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-soft-border)] bg-white p-5">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}
function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-[var(--color-stone)]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-cloud-veil)] px-4 py-3">
      <p className="text-xs font-bold text-[var(--color-stone)]">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}
