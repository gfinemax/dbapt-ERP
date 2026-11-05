create function finance.load_ledger_bank_subject_groups(p_org uuid)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  with normalized as (
    select
      case
        when coalesce((source.payload->>'deposit_amount')::numeric,0)>0 then 'DEPOSIT'
        else 'WITHDRAWAL'
      end as direction,
      coalesce((source.payload->>'deposit_amount')::numeric,0) as deposit_amount,
      coalesce((source.payload->>'withdrawal_amount')::numeric,0) as withdrawal_amount,
      nullif(trim(source.payload->>'ledger_category_id'),'') as category_id,
      nullif(trim(source.payload->>'category_name'),'') as category_name,
      nullif(trim(source.payload->>'category_group'),'') as category_group,
      nullif(trim(source.payload->>'description'),'') as description
    from finance.ledger_bank_transaction_sources source
    where source.organization_id=p_org
      and source.source_system='dbapt-ledger'
      and source.import_status='IMPORTED'
  ), valid as (
    select
      direction,
      case when deposit_amount>0 then deposit_amount else withdrawal_amount end as amount,
      case
        when category_id is not null and category_name is not null and category_name<>'확인필요'
          then 'CATEGORY'
        else 'DESCRIPTION'
      end as match_type,
      case
        when category_id is not null and category_name is not null and category_name<>'확인필요'
          then category_id
        else finance.normalize_ledger_bank_description(description)
      end as source_key,
      case
        when category_id is not null and category_name is not null and category_name<>'확인필요'
          then category_group
        else null
      end as source_group,
      case
        when category_id is not null and category_name is not null and category_name<>'확인필요'
          then category_name
        else description
      end as source_label
    from normalized
    where (deposit_amount>0)<>(withdrawal_amount>0)
  ), grouped as (
    select
      match_type,
      source_key,
      direction,
      min(source_group) as source_group,
      min(source_label) as source_label,
      count(*)::integer as transaction_count,
      sum(amount) as amount_total
    from valid
    where source_key is not null
    group by match_type,source_key,direction
  )
  select jsonb_build_object(
    'transaction_count',(select count(*)::integer from valid),
    'blank_description_count',(select count(*)::integer from valid where source_key is null),
    'groups',coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_type',grouped.match_type,
        'source_key',grouped.source_key,
        'direction',grouped.direction,
        'source_group',grouped.source_group,
        'source_label',grouped.source_label,
        'transaction_count',grouped.transaction_count,
        'amount_total',grouped.amount_total
      ) order by grouped.transaction_count desc,grouped.source_label,grouped.source_key)
      from grouped
    ),'[]'::jsonb)
  )
$$;

create function finance.load_ledger_bank_subject_transactions(
  p_org uuid,
  p_match_type text,
  p_source_key text,
  p_direction text,
  p_page integer,
  p_page_size integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  with matched as (
    select
      source.source_transaction_id,
      source.payload
    from finance.ledger_bank_transaction_sources source
    where source.organization_id=p_org
      and source.source_system='dbapt-ledger'
      and source.import_status='IMPORTED'
      and finance.ledger_bank_subject_rule_matches(
        source.payload,p_match_type,p_source_key,p_direction
      )
  ), paged as (
    select *
    from matched
    order by
      coalesce(payload->>'transaction_date','') desc,
      coalesce(payload->>'transaction_time','') desc,
      source_transaction_id desc
    offset (greatest(p_page,1)-1)*least(greatest(p_page_size,1),100)
    limit least(greatest(p_page_size,1),100)
  )
  select jsonb_build_object(
    'total_count',(select count(*)::integer from matched),
    'rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_transaction_id',paged.source_transaction_id,
        'account_name',nullif(trim(paged.payload->>'account_name'),''),
        'bank_name',nullif(trim(paged.payload->>'bank_name'),''),
        'transaction_date',nullif(trim(paged.payload->>'transaction_date'),''),
        'transaction_time',nullif(trim(paged.payload->>'transaction_time'),''),
        'description',coalesce(nullif(trim(paged.payload->>'description'),''),'적요 없음'),
        'memo',nullif(trim(paged.payload->>'memo'),''),
        'management_memo',nullif(trim(paged.payload->>'management_memo'),''),
        'deposit_amount',coalesce((paged.payload->>'deposit_amount')::numeric,0),
        'withdrawal_amount',coalesce((paged.payload->>'withdrawal_amount')::numeric,0),
        'balance_amount',case
          when nullif(paged.payload->>'balance_amount','') is null then null
          else (paged.payload->>'balance_amount')::numeric
        end
      ) order by
        coalesce(paged.payload->>'transaction_date','') desc,
        coalesce(paged.payload->>'transaction_time','') desc,
        paged.source_transaction_id desc)
      from paged
    ),'[]'::jsonb)
  )
$$;

revoke all on function finance.load_ledger_bank_subject_groups(uuid)
  from public,anon,authenticated;
revoke all on function finance.load_ledger_bank_subject_transactions(uuid,text,text,text,integer,integer)
  from public,anon,authenticated;
grant execute on function finance.load_ledger_bank_subject_groups(uuid) to service_role;
grant execute on function finance.load_ledger_bank_subject_transactions(uuid,text,text,text,integer,integer)
  to service_role;
