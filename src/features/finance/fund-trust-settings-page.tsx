"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { attachTrustFile, downloadTrustFile, executeTrustCommand } from "@/app/finance/trust/actions";
import type { TrustContractRow, TrustReadResult } from "./fund-trust-repository";

const card = "rounded-2xl border border-slate-200 bg-white p-5";
const input = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-600";
const button = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40";
const sourceKinds = [
  ["RESOLUTION", "지출결의"], ["QUICK", "간편지출"], ["PERSONAL", "개인 대납 정산"], ["REFUND", "환급"], ["ADVANCE", "선지급"],
] as const;
const statusLabels = { DRAFT: "설정 중", VERIFIED: "확인 완료", RETIRED: "폐기" };
type Choice = "" | "true" | "false";
type ContractForm = {
  name: string; trustee: string; reference: string; accountId: string; sources: string[];
  documents: string; documentsConfirmed: boolean; consentRoles: string; consentsConfirmed: boolean;
  noLimit: Choice; maximum: string; operatingAllowed: Choice; advanceAllowed: Choice;
  operatingBasis: string; operatingAccounts: string[]; settlementTerms: string;
};
type RecordState = {
  id: string | null; lockVersion: number | null; version: number | null; status: TrustContractRow["status"];
  previousId: string | null; form: ContractForm; conditions: Record<string, unknown>;
};
type EditState = { form: ContractForm; lockVersion: number | null; conditions: Record<string, unknown> };
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const string = (value: unknown) => typeof value === "string" ? value : "";
const choice = (value: unknown): Choice => value === true ? "true" : value === false ? "false" : "";
const bool = (value: Choice) => value === "" ? null : value === "true";
const lines = (value: string) => [...new Set(value.split(/\r?\n/).map(item => item.trim()).filter(Boolean))];
const message = (error: unknown) => error instanceof Error ? error.message : "처리하지 못했어. 입력 내용을 확인하고 다시 시도해줘.";

function fromContract(row?: TrustContractRow): RecordState {
  const c = row?.conditions ?? {};
  return {
    id: row?.id ?? null, lockVersion: row?.lock_version ?? null, version: row?.version ?? null,
    status: row?.status ?? "DRAFT", previousId: null, conditions: c,
    form: {
      name: row?.name ?? "", trustee: row?.trustee ?? "", reference: row?.reference ?? "", accountId: row?.management_account_id ?? "", sources: strings(c.allowed_source_kinds),
      documents: strings(Array.isArray(c.required_document_types) ? c.required_document_types : c.draft_required_document_types).join("\n"),
      documentsConfirmed: Array.isArray(c.required_document_types),
      consentRoles: strings(Array.isArray(c.consent_roles) ? c.consent_roles : c.draft_consent_roles).join("\n"), consentsConfirmed: Array.isArray(c.consent_roles),
      noLimit: choice(c.no_limit), maximum: typeof c.max_request_amount === "number" || typeof c.max_request_amount === "string" ? String(c.max_request_amount) : "",
      operatingAllowed: choice(c.operating_allowed), advanceAllowed: choice(c.operating_advance_allowed), operatingBasis: string(c.operating_basis),
      operatingAccounts: strings(c.operating_account_ids), settlementTerms: string(c.advance_settlement_terms),
    },
  };
}
function conditionsFor(form: ContractForm, previous: Record<string, unknown>) {
  const result: Record<string, unknown> = {
    ...previous, allowed_source_kinds: form.sources,
    required_document_types: form.documentsConfirmed ? lines(form.documents) : null,
    consent_roles: form.consentsConfirmed ? lines(form.consentRoles) : null,
    no_limit: bool(form.noLimit), max_request_amount: form.maximum.trim() ? Number(form.maximum) : null,
    operating_allowed: bool(form.operatingAllowed), operating_advance_allowed: bool(form.advanceAllowed),
    operating_basis: form.operatingBasis.trim(), operating_account_ids: form.operatingAccounts, advance_settlement_terms: form.settlementTerms.trim(),
  };
  if (form.documentsConfirmed) delete result.draft_required_document_types;
  else result.draft_required_document_types = lines(form.documents);
  if (form.consentsConfirmed) delete result.draft_consent_roles;
  else result.draft_consent_roles = lines(form.consentRoles);
  return result;
}
function requiredSettings(form: ContractForm, hasOriginal: boolean) {
  const missing: string[] = [];
  if (!form.name.trim()) missing.push("계약명");
  if (!form.trustee.trim()) missing.push("신탁사");
  if (!form.reference.trim()) missing.push("계약 근거");
  if (!form.accountId) missing.push("관리계좌");
  if (!form.sources.length) missing.push("적용 거래 유형");
  if (!form.documentsConfirmed) missing.push("필수서류 확인");
  if (!form.consentsConfirmed) missing.push("공동 동의 역할 확인");
  if (!form.noLimit || (form.noLimit === "false" && (!Number.isSafeInteger(Number(form.maximum)) || Number(form.maximum) <= 0))) missing.push("요청 한도");
  if (!form.operatingAllowed) missing.push("운영계좌 집행 허용 여부");
  if (!form.advanceAllowed) missing.push("운영비 선교부 허용 여부");
  if (form.operatingAllowed === "true" && (!form.operatingBasis.trim() || !form.operatingAccounts.length || form.operatingAccounts.includes(form.accountId))) missing.push("운영계좌와 집행 근거");
  if (form.advanceAllowed === "true" && (form.operatingAllowed !== "true" || !form.settlementTerms.trim())) missing.push("운영비 선교부 정산 조건");
  if (!hasOriginal) missing.push("계약 원본 첨부");
  return missing;
}

export function FundTrustSettingsPage({ workspace }: { workspace: TrustReadResult }) {
  const router = useRouter();
  const admin = workspace.viewer.permissions.includes("ADMIN");
  const [record, setRecord] = useState(() => fromContract(workspace.contracts[0]));
  const [edit, setEdit] = useState<EditState | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const operationKeys = useRef(new Map<string, string>());
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadIdentity = useRef<{ file: File; uploadId: string; key: string } | null>(null);
  const [fileLink, setFileLink] = useState<{ id: string; url: string } | null>(null);
  const remote = workspace.contracts.find(row => row.id === record.id);
  // A refreshed version replaces a clean form, but never silently advances the lock of unsaved edits.
  const current = remote && remote.lock_version >= (record.lockVersion ?? 0) ? fromContract(remote) : record;
  const form = edit?.form ?? current.form;
  const editable = admin && current.status === "DRAFT";
  const conflict = Boolean(edit && current.lockVersion !== edit.lockVersion);
  const files = current.id ? workspace.files.filter(row => row.contract_version_id === current.id) : [];
  const missing = requiredSettings(form, files.some(row => row.purpose === "CONTRACT"));

  function change(patch: Partial<ContractForm>) {
    if (!editable || inFlight.current) return;
    setEdit(previous => ({
      form: { ...(previous?.form ?? current.form), ...patch },
      lockVersion: previous?.lockVersion ?? current.lockVersion, conditions: previous?.conditions ?? current.conditions,
    }));
    setNotice("");
  }
  function select(next: RecordState) {
    if (inFlight.current) return;
    setRecord(next); setEdit(null); setReason(""); setError(""); setNotice(""); setFile(null); setFileLink(null);
    uploadIdentity.current = null; operationKeys.current.clear();
    if (fileInput.current) fileInput.current.value = "";
  }
  async function task(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (caught) { setError(message(caught)); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function command(kind: "CONTRACT_SAVE" | "CONTRACT_VERIFY" | "CONTRACT_RETIRE", payload: Record<string, unknown>) {
    const signature = JSON.stringify([kind, payload]);
    let key = operationKeys.current.get(signature);
    if (!key) { key = crypto.randomUUID(); operationKeys.current.set(signature, key); }
    const result = await executeTrustCommand(kind, payload, key);
    if (result.lock_version === undefined) throw new Error("저장된 계약 버전을 확인하지 못했어. 같은 내용으로 다시 시도해줘.");
    operationKeys.current.delete(signature);
    return { id: result.id, lockVersion: result.lock_version };
  }
  function save() {
    if (!editable) return;
    void task(async () => {
      if (form.maximum.trim() && (!Number.isSafeInteger(Number(form.maximum)) || Number(form.maximum) <= 0)) throw new Error("요청 한도는 양의 원 단위 정수로 입력해줘. 미확정이면 비워둘 수 있어.");
      const conditions = conditionsFor(form, edit?.conditions ?? current.conditions);
      const payload = {
        ...(current.id ? { id: current.id, lock_version: edit?.lockVersion ?? current.lockVersion } : {}),
        ...(current.previousId ? { previous_version_id: current.previousId } : {}),
        name: form.name.trim(), trustee: form.trustee.trim(), reference: form.reference.trim(), management_account_id: form.accountId || null, conditions,
      };
      const result = await command("CONTRACT_SAVE", payload);
      setRecord({ ...current, ...result, previousId: null, form: { ...form, name: payload.name, trustee: payload.trustee, reference: payload.reference }, conditions });
      setEdit(null); setNotice("계약 초안을 저장했어."); router.refresh();
    });
  }
  function changeStatus(kind: "CONTRACT_VERIFY" | "CONTRACT_RETIRE") {
    if (!admin || !current.id || edit || current.status === "RETIRED") return;
    void task(async () => {
      if (!reason.trim()) throw new Error("확인 또는 폐기 사유를 입력해줘.");
      if (kind === "CONTRACT_VERIFY" && (current.status !== "DRAFT" || missing.length)) throw new Error("계약 조건과 원본 첨부를 먼저 확인해줘.");
      const result = await command(kind, { id: current.id, lock_version: current.lockVersion, reason: reason.trim() });
      setRecord({ ...current, ...result, status: kind === "CONTRACT_VERIFY" ? "VERIFIED" : "RETIRED" });
      setReason(""); setNotice(kind === "CONTRACT_VERIFY" ? "계약 조건을 확인했어. 이 버전의 내용을 보존해." : "계약 버전을 폐기했어. 기존 이력은 보존해."); router.refresh();
    });
  }
  function upload() {
    if (!editable || !current.id || !file) return;
    void task(async () => {
      if (file.size > 3 * 1024 * 1024) throw new Error("계약 원본은 파일당 3MB 이하로 첨부해줘.");
      if (!uploadIdentity.current || uploadIdentity.current.file !== file) uploadIdentity.current = { file, uploadId: crypto.randomUUID(), key: crypto.randomUUID() };
      const data = new FormData();
      data.set("file", file); data.set("purpose", "CONTRACT"); data.set("contract_version_id", current.id!);
      data.set("upload_id", uploadIdentity.current.uploadId); data.set("operation_key", uploadIdentity.current.key);
      await attachTrustFile(data);
      setFile(null); uploadIdentity.current = null; if (fileInput.current) fileInput.current.value = "";
      setNotice("계약 원본을 첨부했어."); router.refresh();
    });
  }
  function openFile(id: string) {
    void task(async () => { setFileLink({ id, url: await downloadTrustFile(id) }); });
  }
  function newVersion() {
    if (!admin || !current.id || current.status === "DRAFT") return;
    select({ ...current, id: null, lockVersion: null, version: null, status: "DRAFT", previousId: current.id });
  }

  return <div className="space-y-5">
    <header className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">지출·신탁 설정</h1><p className="mt-2 text-sm text-slate-600">계약서에 명시된 집행 조건을 버전별로 관리해. 아직 확인하지 못한 조건은 초안으로 보관할 수 있어.</p></div><Link className={`${secondary} inline-block`} href="/finance/expense-settings">기존 지출 관리설정</Link></div>
      {!admin ? <p className="mt-3 text-sm text-slate-600">계약 내용을 조회할 수 있어. 등록과 변경은 관리자가 처리해.</p> : null}
    </header>
    <section className={card} aria-labelledby="trust-contract-list">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="trust-contract-list" className="text-lg font-bold">계약 버전</h2>{admin ? <button className={secondary} disabled={busy} onClick={() => select(fromContract())}>새 계약 초안</button> : null}</div>
      {!workspace.contracts.length ? <p className="text-sm text-slate-600">저장된 신탁 계약이 없어.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-slate-600"><tr><th className="p-2">계약명</th><th className="p-2">신탁사</th><th className="p-2">버전</th><th className="p-2">상태</th><th className="p-2">상세</th></tr></thead><tbody>{workspace.contracts.map(row => <tr key={row.id} className={`border-b ${current.id === row.id ? "bg-blue-50" : ""}`}><td className="p-2">{row.name || "계약명 미입력"}</td><td className="p-2">{row.trustee || "미입력"}</td><td className="p-2">{row.version}</td><td className="p-2">{statusLabels[row.status]}</td><td className="p-2"><button aria-label={`${row.name || "계약명 미입력"} 버전 ${row.version} 상세`} aria-pressed={current.id === row.id} className={secondary} disabled={busy} onClick={() => select(fromContract(row))}>상세</button></td></tr>)}</tbody></table></div>}
    </section>
    {(admin || current.id) ? <section className={card} aria-labelledby="trust-contract-details">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="trust-contract-details" className="text-lg font-bold">{current.id ? `${statusLabels[current.status]} · 계약 버전 ${current.version ?? "조회 중"}` : current.previousId ? "기존 계약의 새 버전 초안" : "새 계약 초안 작성"}</h2>{current.lockVersion !== null ? <p className="mt-1 text-xs text-slate-500">저장 버전 {current.lockVersion}{edit ? " · 저장하지 않은 변경 있음" : ""}</p> : null}</div>{admin && current.id && current.status !== "DRAFT" ? <button className={secondary} disabled={busy} onClick={newVersion}>이 계약에서 새 버전 작성</button> : null}</div>
      {current.previousId ? <p className="mt-3 text-sm text-slate-600">이전 계약 내용을 복사했어. 새 버전에 적용할 조건을 확인하고 계약 원본을 다시 첨부해줘.</p> : null}
      {conflict ? <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm"><p>다른 변경이 저장됐어. 작성 중인 내용은 유지했어. 다시 불러오면 현재 입력을 저장된 내용으로 바꿔.</p><button className={`${secondary} mt-2`} disabled={busy} onClick={() => select(current)}>저장된 내용 다시 불러오기</button></div> : null}
      {error ? <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p> : null}
      <form className="mt-5 space-y-5" onSubmit={event => { event.preventDefault(); save(); }}>
        <fieldset disabled={!editable || busy} className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 font-semibold">계약 기본정보</legend>
          <label className="text-sm">계약명<input className={input} value={form.name} onChange={event => change({ name: event.target.value })} /></label>
          <label className="text-sm">신탁사<input className={input} value={form.trustee} onChange={event => change({ trustee: event.target.value })} /></label>
          <label className="text-sm">계약 근거<input className={input} value={form.reference} onChange={event => change({ reference: event.target.value })} /></label>
          <label className="text-sm">관리계좌<select className={input} value={form.accountId} onChange={event => change({ accountId: event.target.value })}><option value="">미선택</option>{workspace.accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}</select></label>
        </fieldset>
        <fieldset disabled={!editable || busy} className="space-y-4 rounded-xl border border-slate-200 p-4">
          <legend className="px-2 font-semibold">계약상 집행 조건</legend>
          <fieldset><legend className="mb-2 text-sm font-semibold">적용 거래 유형</legend><div className="flex flex-wrap gap-4">{sourceKinds.map(([kind, label]) => <label key={kind} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.sources.includes(kind)} onChange={event => change({ sources: event.target.checked ? [...form.sources, kind] : form.sources.filter(value => value !== kind) })} />{label}</label>)}</div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2"><div><label className="text-sm">필수서류 항목<textarea className={`${input} min-h-24`} value={form.documents} onChange={event => change({ documents: event.target.value, documentsConfirmed: false })} /></label><p className="mt-1 text-xs text-slate-500">한 줄에 한 항목. 필수서류가 없으면 비워두고 확인해줘.</p><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.documentsConfirmed} onChange={event => change({ documentsConfirmed: event.target.checked })} />필수서류 목록 확인</label></div>
          <div><label className="text-sm">공동 동의 역할<textarea className={`${input} min-h-24`} value={form.consentRoles} onChange={event => change({ consentRoles: event.target.value, consentsConfirmed: false })} /></label><p className="mt-1 text-xs text-slate-500">한 줄에 한 역할. 공동 동의가 없으면 비워두고 확인해줘.</p><label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={form.consentsConfirmed} onChange={event => change({ consentsConfirmed: event.target.checked })} />공동 동의 역할 확인</label></div></div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">요청 한도<select className={input} value={form.noLimit} onChange={event => change({ noLimit: event.target.value as Choice })}><option value="">미확인</option><option value="false">금액 한도 있음</option><option value="true">계약상 한도 없음</option></select></label>{form.noLimit === "false" ? <label className="text-sm">요청 한도 금액 (원)<input className={input} type="number" min="1" step="1" value={form.maximum} onChange={event => change({ maximum: event.target.value })} /></label> : null}</div>
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">운영계좌 집행 허용<select className={input} value={form.operatingAllowed} onChange={event => change({ operatingAllowed: event.target.value as Choice })}><option value="">미확인</option><option value="true">허용</option><option value="false">불허</option></select></label><label className="text-sm">운영비 선교부 허용<select className={input} value={form.advanceAllowed} onChange={event => change({ advanceAllowed: event.target.value as Choice })}><option value="">미확인</option><option value="true">허용</option><option value="false">불허</option></select></label></div>
          {form.operatingAllowed === "true" ? <div className="space-y-3"><label className="block text-sm">운영계좌 집행 근거<textarea className={input} value={form.operatingBasis} onChange={event => change({ operatingBasis: event.target.value })} /></label><fieldset><legend className="mb-2 text-sm font-semibold">허용 운영계좌</legend><div className="space-y-2">{workspace.accounts.filter(account => account.id !== form.accountId).map(account => <label key={account.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.operatingAccounts.includes(account.id)} onChange={event => change({ operatingAccounts: event.target.checked ? [...form.operatingAccounts, account.id] : form.operatingAccounts.filter(id => id !== account.id) })} />{account.label}</label>)}</div>{!workspace.accounts.some(account => account.id !== form.accountId) ? <p className="text-sm text-slate-600">선택할 운영계좌가 없어.</p> : null}</fieldset></div> : null}
          {form.advanceAllowed === "true" ? <label className="block text-sm">운영비 선교부 정산 조건<textarea className={input} value={form.settlementTerms} onChange={event => change({ settlementTerms: event.target.value })} /></label> : null}
        </fieldset>
        {editable ? <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={busy} type="submit">초안 저장</button><span className="text-sm text-slate-600">미확정 조건이 있어도 초안은 저장할 수 있어.</span></div> : <p className="text-sm text-slate-600">{current.status === "DRAFT" ? "관리자가 계약 조건을 작성할 수 있어." : "보존된 계약 버전이야. 조건 변경은 새 버전으로 작성해줘."}</p>}
      </form>
      <section className="mt-6 border-t pt-5" aria-labelledby="trust-contract-files"><h3 id="trust-contract-files" className="font-semibold">계약 첨부</h3>
        {files.length ? <ul className="mt-3 space-y-2">{files.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"><span>{item.file_name}{item.purpose === "CONTRACT" ? " · 계약 원본" : ""}</span><button className={secondary} disabled={busy} onClick={() => openFile(item.id)}>다운로드 준비</button>{fileLink?.id === item.id ? <a className="text-blue-700 underline" href={fileLink.url} target="_blank" rel="noreferrer">파일 열기 (1분 동안 사용 가능)</a> : null}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">첨부된 계약 원본이 없어.</p>}
        {editable ? <div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">계약 원본 파일<input ref={fileInput} className={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy || !current.id} onChange={event => { const selected = event.target.files?.[0] ?? null; setFile(selected); uploadIdentity.current = null; }} /></label><button className={secondary} disabled={busy || !current.id || !file} onClick={upload}>계약 원본 첨부</button><p className="w-full text-xs text-slate-500">{current.id ? "PDF·PNG·JPEG·WebP, 파일당 3MB 이하" : "계약 초안을 저장하면 원본을 첨부할 수 있어."}{file ? ` · 선택 파일: ${file.name}` : ""}</p></div> : null}
      </section>
      {admin && current.id && current.status !== "RETIRED" ? <section className="mt-6 space-y-3 border-t pt-5" aria-labelledby="trust-contract-confirm"><h3 id="trust-contract-confirm" className="font-semibold">계약 확인·폐기</h3>
        {current.status === "DRAFT" ? <p className="rounded-lg border bg-slate-50 p-3 text-sm">{missing.length ? `설정 필요: ${missing.join(", ")}` : "계약 조건과 원본 첨부가 준비됐어. 근거를 확인한 뒤 확정해줘."}</p> : null}
        {edit ? <p className="text-sm text-amber-800">확인·폐기 전에 작성 중인 변경을 저장해줘.</p> : null}
        <label className="block text-sm">확인·폐기 사유<textarea className={input} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
        <div className="flex flex-wrap gap-3">{current.status === "DRAFT" ? <button className={button} disabled={busy || Boolean(edit) || missing.length > 0} onClick={() => changeStatus("CONTRACT_VERIFY")}>계약 조건 확인 완료</button> : null}<button className={secondary} disabled={busy || Boolean(edit)} onClick={() => changeStatus("CONTRACT_RETIRE")}>이 버전 폐기</button></div>
      </section> : null}
    </section> : null}
  </div>;
}
