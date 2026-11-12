alter table finance.bank_transaction_export_audit_logs
  drop constraint if exists bank_transaction_export_audit_logs_export_format_check;

alter table finance.bank_transaction_export_audit_logs
  add constraint bank_transaction_export_audit_logs_export_format_check
  check (export_format in ('XLSX', 'PDF', 'GOOGLE_SHEETS'));

comment on column finance.bank_transaction_export_audit_logs.export_format is
  '내보내기 형식: XLSX, PDF, GOOGLE_SHEETS';
