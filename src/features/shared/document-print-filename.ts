export function buildDocumentPdfFileName(documentNo: string, title: string, fallback = "문서") {
  const sanitize = (value: string) => value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return `${sanitize(documentNo) || fallback}(${sanitize(title) || "제목 미입력"}).pdf`;
}
