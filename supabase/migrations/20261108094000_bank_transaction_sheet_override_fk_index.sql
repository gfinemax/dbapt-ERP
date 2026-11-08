-- 거래 상세의 최신 시트 보정 조회와 bank_transaction_id 외래키 검사를 같은 인덱스로 지원한다.
drop index if exists finance.bank_transaction_sheet_overrides_transaction_idx;
create index bank_transaction_sheet_overrides_transaction_idx
  on finance.bank_transaction_sheet_field_overrides(
    bank_transaction_id,
    organization_id,
    field_name,
    imported_at desc
  );
