-- FK 삭제/변경 검증이 전체 테이블 순회를 하지 않도록 참조키 선두 인덱스를 둔다.
create index if not exists bank_transaction_metadata_import_bank_transaction_fk_idx
  on finance.bank_transaction_metadata_imports(bank_transaction_id);
create index if not exists bank_transaction_metadata_import_replacement_batch_fk_idx
  on finance.bank_transaction_metadata_imports(replacement_batch_id);
