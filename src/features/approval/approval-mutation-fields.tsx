"use client";
import { useState } from "react";
export function ApprovalMutationFields({ version, create = false }: { version: number; create?: boolean }) {
 const [operationKey] = useState(() => crypto.randomUUID());
 const [documentId] = useState(() => crypto.randomUUID());
 return <>{create ? <input suppressHydrationWarning name="documentId" type="hidden" value={documentId} /> : null}<input name="expectedVersion" type="hidden" value={version} /><input suppressHydrationWarning name="operationKey" type="hidden" value={operationKey} /></>;
}
