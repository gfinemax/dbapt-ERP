create schema if not exists finance;

create unique index if not exists bank_accounts_active_account_no_key on finance.bank_accounts (account_no) where deleted_at is null;

create table if not exists finance.items (
  id uuid primary key default gen_random_uuid(), organization_id uuid references core.organizations(id), code text not null unique,
  name text not null, category text not null default '미분류', unit text not null default '식', description text not null default '',
  usage_status text not null default '사용' check (usage_status in ('사용', '사용안함')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists finance.credit_cards (
  id uuid primary key default gen_random_uuid(), organization_id uuid references core.organizations(id), card_company text not null,
  card_name text not null, card_last_four text not null check (card_last_four ~ '^[0-9]{4}$'), card_type text not null check (card_type in ('법인카드', '업무대행카드')),
  issued_at date not null, usage_status text not null default '사용' check (usage_status in ('사용', '사용안함')), last_synced_at timestamptz,
  sync_status text not null default '확인필요' check (sync_status in ('정상', '확인필요')), limit_amount numeric(16,0) not null default 0,
  settlement_bank text not null default '미지정', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index if not exists credit_cards_active_identity_key on finance.credit_cards (card_company, card_last_four) where deleted_at is null;
create index if not exists items_organization_id_idx on finance.items (organization_id);
create index if not exists credit_cards_organization_id_idx on finance.credit_cards (organization_id);
grant select, insert, update on finance.items, finance.credit_cards to service_role;
alter table finance.items enable row level security;
alter table finance.credit_cards enable row level security;
