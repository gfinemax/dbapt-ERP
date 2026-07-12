create table if not exists finance.expense_evidence_ocr_jobs (
  id uuid primary key,
  resolution_no text not null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  content_type text not null,
  evidence_type text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  stage text not null default 'UPLOADED' check (stage in ('UPLOADED', 'RENDERING', 'PREPROCESSING', 'RECOGNIZING', 'STRUCTURING', 'COMPLETED', 'FAILED')),
  progress integer not null default 20 check (progress between 0 and 100),
  provider text check (provider in ('OPENAI', 'TESSERACT', 'EMBEDDED_TEXT')),
  result_data jsonb not null default '{}'::jsonb,
  error_message text,
  attempt_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table finance.expense_evidence_ocr_jobs enable row level security;
revoke all on finance.expense_evidence_ocr_jobs from anon, authenticated;
grant all on finance.expense_evidence_ocr_jobs to service_role;

create index if not exists expense_evidence_ocr_jobs_status_idx
  on finance.expense_evidence_ocr_jobs (status, created_at desc);
