export type LedgerBankBackfillAccount = {
  account_name: string;
  account_number_last4: string | null;
  bank_name: string | null;
  conflict_count: number;
  erp_bank_account_id: string | null;
  imported_count: number;
  invalid_count: number;
  ledger_account_id: string;
  mapping_note: string | null;
  pending_count: number;
};

export type LedgerBankBackfillStatus = {
  accounts: LedgerBankBackfillAccount[];
  state: {
    last_cursor: number;
    last_status: "NEVER" | "PARTIAL" | "SUCCESS" | "FAILED";
    last_synced_at: string | null;
    source_frozen: boolean;
  } | null;
  totals: {
    conflict: number;
    imported: number;
    invalid: number;
    pending: number;
    staged: number;
  };
};

export type LedgerBankSyncResult = {
  complete: boolean;
  imported_count: number;
  invalid_count: number;
  next_cursor: number;
  received_count: number;
  status: LedgerBankBackfillStatus;
};

export type LedgerBankActionResult<T> =
  | { data: T; ok: true }
  | { error: string; ok: false };

export const emptyLedgerBankBackfillStatus: LedgerBankBackfillStatus = {
  accounts: [],
  state: null,
  totals: { conflict: 0, imported: 0, invalid: 0, pending: 0, staged: 0 },
};
