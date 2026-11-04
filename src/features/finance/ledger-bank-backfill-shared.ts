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

export type LedgerBankImportedTransaction = {
  balance_amount: number | null;
  bank_transaction_id: string;
  category_group: string | null;
  category_name: string | null;
  deposit_amount: number;
  description: string;
  imported_at: string;
  management_memo: string | null;
  payload_hash: string;
  source_transaction_id: string;
  transaction_date: string;
  transaction_kind: "입금" | "출금" | "금액 없음";
  transaction_time: string | null;
  withdrawal_amount: number;
};

export type LedgerBankImportedTransactionDetail = {
  deposit_total: number;
  first_transaction_date: string | null;
  last_transaction_date: string | null;
  page: number;
  page_size: number;
  rows: LedgerBankImportedTransaction[];
  total_count: number;
  total_pages: number;
  withdrawal_total: number;
};

export type LedgerBankActionResult<T> =
  | { data: T; ok: true }
  | { error: string; ok: false };

export const emptyLedgerBankBackfillStatus: LedgerBankBackfillStatus = {
  accounts: [],
  state: null,
  totals: { conflict: 0, imported: 0, invalid: 0, pending: 0, staged: 0 },
};
