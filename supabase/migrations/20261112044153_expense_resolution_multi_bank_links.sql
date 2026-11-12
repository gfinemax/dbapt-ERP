create table if not exists finance.expense_resolution_bank_transactions (
  organization_id uuid not null references core.organizations(id) on delete cascade,
  resolution_id text not null references finance.expense_resolutions(id) on delete cascade,
  bank_transaction_id uuid not null references finance.bank_transactions(id) on delete restrict,
  item_id text,
  transaction_date date not null,
  amount numeric(18,2) not null check (amount > 0),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (resolution_id, bank_transaction_id),
  unique (bank_transaction_id)
);

create index if not exists expense_resolution_bank_transactions_org_resolution_idx
  on finance.expense_resolution_bank_transactions (organization_id, resolution_id);

alter table finance.expense_resolution_bank_transactions enable row level security;
revoke all on finance.expense_resolution_bank_transactions from public, anon, authenticated;
grant all on finance.expense_resolution_bank_transactions to service_role;

create or replace function finance.sync_expense_resolution_bank_transactions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  links jsonb;
  link jsonb;
  old_ids uuid[];
  new_ids uuid[] := '{}';
  ref_id uuid;
  link_amount numeric;
  link_date date;
  transaction finance.bank_transactions;
  link_status text;
begin
  if not (new.resolution_data ? 'bankTransactions')
     and not (old.resolution_data ? 'bankTransactions') then
    return new;
  end if;

  links := case
    when new.deleted_at is null then coalesce(new.resolution_data->'bankTransactions', '[]'::jsonb)
    else '[]'::jsonb
  end;
  if jsonb_typeof(links) is distinct from 'array' then
    raise exception '연결 통장거래 형식을 확인해주세요.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(links) entry
    group by entry->>'id'
    having count(*) > 1
  ) then
    raise exception '연결 통장거래가 중복되었습니다.';
  end if;

  select coalesce(array_agg(bank_transaction_id), '{}')
    into old_ids
  from finance.expense_resolution_bank_transactions
  where resolution_id = new.id;

  for link in select value from jsonb_array_elements(links)
  loop
    ref_id := nullif(link->>'id', '')::uuid;
    link_amount := nullif(link->>'amount', '')::numeric;
    link_date := nullif(link->>'transactionDate', '')::date;
    if ref_id is null or link_amount is null or link_date is null then
      raise exception '연결 통장거래의 ID·일자·금액이 필요합니다.';
    end if;

    select * into transaction
    from finance.bank_transactions
    where id = ref_id
      and organization_id = new.organization_id
      and deleted_at is null
    for update;
    if not found then
      raise exception '조직의 통장거래가 아닙니다.';
    end if;
    if transaction.withdrawal_amount is distinct from link_amount
       or (transaction.transacted_at at time zone 'Asia/Seoul')::date is distinct from link_date then
      raise exception '통장거래 일자 또는 금액이 원본과 다릅니다.';
    end if;
    if exists (
      select 1
      from finance.expense_resolutions other
      where other.organization_id = new.organization_id
        and other.id <> new.id
        and other.deleted_at is null
        and other.bank_transaction_id = ref_id
    ) or exists (
      select 1
      from finance.expense_resolution_bank_transactions other
      where other.bank_transaction_id = ref_id
        and other.resolution_id <> new.id
    ) then
      raise exception '통장거래가 다른 지출결의에 연결되어 있습니다.';
    end if;

    new_ids := array_append(new_ids, ref_id);
    insert into finance.expense_resolution_bank_transactions (
      organization_id, resolution_id, bank_transaction_id, item_id,
      transaction_date, amount, description, updated_at
    ) values (
      new.organization_id, new.id, ref_id, nullif(link->>'itemId', ''),
      link_date, link_amount, coalesce(link->>'description', ''), now()
    )
    on conflict (resolution_id, bank_transaction_id) do update set
      item_id = excluded.item_id,
      transaction_date = excluded.transaction_date,
      amount = excluded.amount,
      description = excluded.description,
      updated_at = now();
  end loop;

  if coalesce((select sum((entry->>'amount')::numeric) from jsonb_array_elements(links) entry), 0)
     is distinct from (case when jsonb_array_length(links) > 0 then new.total_payment_amount else 0 end) then
    raise exception '연결 통장거래 합계가 지출결의 총액과 다릅니다.';
  end if;

  delete from finance.expense_resolution_bank_transactions
  where resolution_id = new.id
    and not (bank_transaction_id = any(new_ids));

  for ref_id in
    select unnest(old_ids)
    except
    select unnest(new_ids)
  loop
    if not exists (
      select 1 from finance.expense_resolutions r
      where r.organization_id = new.organization_id
        and r.deleted_at is null
        and r.bank_transaction_id = ref_id
    ) and not exists (
      select 1 from finance.expense_resolution_bank_transactions l
      where l.organization_id = new.organization_id
        and l.bank_transaction_id = ref_id
    ) then
      update finance.bank_transactions
      set resolution_status = 'UNRESOLVED'
      where id = ref_id and organization_id = new.organization_id;
    end if;
  end loop;

  link_status := case
    when new.approval_status = '승인완료' then 'APPROVED'
    when new.evidence_status in ('NONE', 'DEFICIENT') then 'EVIDENCE_MISSING'
    else 'DRAFTING'
  end;
  update finance.bank_transactions
  set resolution_status = link_status
  where organization_id = new.organization_id
    and id = any(new_ids);

  return new;
end;
$$;

revoke all on function finance.sync_expense_resolution_bank_transactions() from public, anon, authenticated;
grant execute on function finance.sync_expense_resolution_bank_transactions() to service_role;

drop trigger if exists sync_expense_resolution_bank_transactions
  on finance.expense_resolutions;
create trigger sync_expense_resolution_bank_transactions
after insert or update of resolution_data, deleted_at, approval_status, evidence_status
on finance.expense_resolutions
for each row execute function finance.sync_expense_resolution_bank_transactions();
