export type TrustPrintSnapshot = {
  requestNo: string;
  title: string;
  requestDate: string | null;
  revision: number;
  submittedAt: string;
  trustee: string;
  contractName: string;
  contractReference: string;
  managementAccountLabel: string;
  receiptReference: string;
  items: {
    id: string;
    sourceNo: string;
    title: string;
    recipient: string;
    accountMasked: string;
    requestedAmount: number;
  }[];
  files: { name: string; sha256: string }[];
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function text(value: string | null) {
  return value?.trim() ? escapeHtml(value) : '<span class="missing">미입력</span>';
}

function checkAmount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("요청금액은 안전한 정수 범위의 0 이상 원 단위 금액이어야 합니다.");
  return value;
}

/** Renders supplied submission values only: no live record lookup, timestamps or account inference. */
export function renderTrustRequestPrint(snapshot: TrustPrintSnapshot): string {
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) throw new Error("제출 버전은 0 이상의 정수여야 합니다.");
  const total = snapshot.items.reduce((sum, item) => checkAmount(sum + checkAmount(item.requestedAmount)), 0);
  const amount = (value: number) => `${value.toLocaleString("ko-KR")}원`;
  const status = snapshot.revision > 0 ? "제출본" : "요청 준비";
  const fields: [string, string | null][] = [
    ["요청번호", snapshot.requestNo], ["요청일", snapshot.requestDate],
    ["제출 버전", String(snapshot.revision)], ["제출일시", snapshot.submittedAt],
    ["대상 신탁사", snapshot.trustee], ["관리계좌", snapshot.managementAccountLabel],
    ["계약명", snapshot.contractName], ["계약 근거", snapshot.contractReference],
    ["접수정보", snapshot.receiptReference],
  ];
  const metadata = fields.map(([label, value]) => `<div class="field"><dt>${label}</dt><dd>${text(value)}</dd></div>`).join("");
  const items = snapshot.items.length ? snapshot.items.map((item, index) => `<tr>
    <td class="number">${index + 1}</td><td>${text(item.sourceNo)}</td><td>${text(item.title)}</td>
    <td>${text(item.recipient)}</td><td>${text(item.accountMasked)}</td><td class="money">${amount(item.requestedAmount)}</td>
  </tr>`).join("") : '<tr><td colspan="6" class="empty">요청 항목 미입력</td></tr>';
  const files = snapshot.files.length ? snapshot.files.map((file, index) => `<tr>
    <td class="number">${index + 1}</td><td>${text(file.name)}</td><td class="hash">${text(file.sha256)}</td>
  </tr>`).join("") : '<tr><td colspan="3" class="empty">첨부파일 없음</td></tr>';
  const documentTitle = snapshot.requestNo.trim() ? `${snapshot.requestNo} · 신탁 자금집행 요청 내역` : "신탁 자금집행 요청 내역";
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(documentTitle)}</title>
<style>
@page{size:A4 portrait;margin:14mm 12mm 16mm}
*{box-sizing:border-box}body{margin:0;color:#171717;background:#fff;font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;font-size:10pt;line-height:1.5}
main{max-width:186mm;margin:0 auto;padding:10mm 0}header{border-bottom:2px solid #222;padding-bottom:5mm;margin-bottom:5mm}
.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:4mm}h1{font-size:19pt;line-height:1.3;margin:0;overflow-wrap:anywhere}
.status{flex-shrink:0;border:1px solid #333;padding:1mm 3mm;font-weight:700}.context{margin:2mm 0 0;color:#555}.request-title{font-size:13pt;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere;margin:4mm 0 0}
dl{display:grid;grid-template-columns:1fr 1fr;margin:0;border-top:1px solid #777;border-left:1px solid #777}
.field{display:grid;grid-template-columns:24mm minmax(0,1fr);border-right:1px solid #777;border-bottom:1px solid #777;break-inside:avoid}
dt{background:#f3f3f3;padding:2mm;font-weight:700;border-right:1px solid #777}dd{margin:0;padding:2mm;white-space:pre-wrap;overflow-wrap:anywhere}
.field:last-child{grid-column:1/-1}h2{font-size:12pt;margin:6mm 0 2mm;break-after:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #777;padding:2mm;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#f3f3f3;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}
.number{width:9mm;text-align:center}.money{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.empty{text-align:center;color:#666;padding:5mm}.missing{color:#666}
.hash{font-family:Consolas,monospace;font-size:8pt;word-break:break-all}.totals td{font-weight:700;background:#f3f3f3}footer{margin-top:6mm;font-size:9pt;color:#555;break-inside:avoid}
@media print{main{max-width:none;padding:0}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><main>
<header><div class="heading"><h1>신탁 자금집행 요청 내역</h1><span class="status">${status}</span></div>
<p class="context">내부 관리용 요청 내역</p><p class="request-title">${text(snapshot.title)}</p></header>
<dl>${metadata}</dl>
<section><h2>요청 항목</h2><table aria-label="요청 항목과 금액">
<colgroup><col style="width:5%"><col style="width:17%"><col style="width:25%"><col style="width:16%"><col style="width:18%"><col style="width:19%"></colgroup>
<thead><tr><th scope="col" class="number">순서</th><th scope="col">원본문서</th><th scope="col">지출 내용</th><th scope="col">수취인</th><th scope="col">수취계좌</th><th scope="col" class="money">이번 요청액</th></tr></thead>
<tbody>${items}</tbody><tbody class="totals"><tr><td colspan="5">이번 요청액 합계</td><td class="money">${amount(total)}</td></tr></tbody></table></section>
<section><h2>첨부파일 버전 확인</h2><table aria-label="첨부파일과 해시">
<colgroup><col style="width:5%"><col style="width:40%"><col style="width:55%"></colgroup>
<thead><tr><th scope="col" class="number">순서</th><th scope="col">파일명</th><th scope="col">SHA-256</th></tr></thead><tbody>${files}</tbody></table></section>
<footer>표시된 요청 내용과 첨부파일 해시는 선택한 버전을 기준으로 합니다.</footer>
</main></body></html>`;
}
