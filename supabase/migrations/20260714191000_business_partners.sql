create table if not exists core.business_partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references core.organizations(id),
  code text not null,
  partner_type text not null default '매입' check (partner_type in ('매출', '매입', '혼합')),
  owner_type text not null default '사업자' check (owner_type in ('사업자', '개인')),
  name text not null,
  registration_no text not null,
  representative text not null default '미입력',
  business_category text not null default '미입력',
  business_item text not null default '미입력',
  address text,
  project_scope text not null default '회계/자금',
  phone text not null default '',
  balance_type text not null default '채무' check (balance_type in ('채권', '채무', '정산')),
  balance_amount numeric(16, 0) not null default 0,
  evidence_profile_status text not null default '미비' check (evidence_profile_status in ('완료', '미비')),
  registration_source text not null default '직접등록' check (registration_source in ('직접등록', 'OCR 자동등록')),
  first_transaction_date date,
  source_resolution_no text,
  source_evidence_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (registration_no),
  unique (code)
);

grant select, insert, update on core.business_partners to service_role;
create index if not exists business_partners_name_idx on core.business_partners (name);
create index if not exists business_partners_registration_no_idx on core.business_partners (registration_no);
