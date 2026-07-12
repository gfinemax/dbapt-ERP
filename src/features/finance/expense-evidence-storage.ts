const evidenceFileExtensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/csv": "csv",
  "text/plain": "txt",
};

export function buildExpenseEvidenceStoragePath(resolutionNo: string, id: string, contentType: string) {
  const safeResolutionNo = resolutionNo
    .normalize("NFKD")
    .replace(/[^0-9A-Za-z_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "resolution";
  const safeId = id.replace(/[^0-9A-Za-z_-]+/g, "-");
  const extension = evidenceFileExtensions[contentType] ?? "bin";
  return `expense-resolutions/${safeResolutionNo}/${safeId}.${extension}`;
}
