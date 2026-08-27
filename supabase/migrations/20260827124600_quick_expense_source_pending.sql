alter table finance.quick_expense_records drop constraint if exists quick_expense_records_record_status_check;
alter table finance.quick_expense_records add constraint quick_expense_records_record_status_check
  check (record_status in ('RECORDED', 'SOURCE_PENDING', 'NEEDS_RESOLUTION', 'CONVERTED'));
