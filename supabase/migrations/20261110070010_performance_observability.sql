-- Read-only ERP performance telemetry. Search terms, account data, and page query strings are never stored.
create table finance.performance_measurements (
  id bigint generated always as identity primary key,
  organization_id uuid not null references core.organizations(id),
  user_id uuid not null references auth.users(id),
  session_id uuid not null,
  route text not null check (route ~ '^/[A-Za-z0-9_/-]*$' and length(route) <= 160),
  metric_type text not null check (metric_type in ('WEB_VITAL','NAVIGATION')),
  metric_name text not null check (metric_name in ('TTFB','FCP','LCP','CLS','INP','ROUTE_READY','NAVIGATION')),
  value double precision not null check (value >= 0 and value <= 120000),
  unit text not null check (unit in ('ms','score')),
  rating text check (rating in ('good','needs-improvement','poor')),
  navigation_type text check (navigation_type is null or length(navigation_type) <= 40),
  sample_id text check (sample_id is null or length(sample_id) <= 128),
  measured_at timestamptz not null default now()
);

create index performance_measurements_org_time_idx
  on finance.performance_measurements(organization_id,measured_at desc);
create index performance_measurements_org_route_metric_time_idx
  on finance.performance_measurements(organization_id,route,metric_name,measured_at desc);

alter table finance.performance_measurements enable row level security;
revoke all on finance.performance_measurements from public,anon,authenticated;
grant select,insert,delete on finance.performance_measurements to service_role;
grant usage,select on sequence finance.performance_measurements_id_seq to service_role;
create policy performance_measurements_server_only on finance.performance_measurements
  for all to service_role using (true) with check (true);

create function finance.performance_dashboard(p_org uuid,p_actor uuid,p_days integer default 7)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days,7),1),30);
  v_member finance.reimbursement_members%rowtype;
begin
  select * into v_member
  from finance.reimbursement_members
  where organization_id=p_org and user_id=p_actor and active;
  if not found or not ('ADMIN'=any(v_member.permissions)) then
    raise exception '성능 현황은 관리자만 확인할 수 있습니다.';
  end if;

  return (
    with measurements as (
      select route,metric_name,unit,value,measured_at
      from finance.performance_measurements
      where organization_id=p_org
        and measured_at >= now() - (v_days * interval '1 day')
    ), global_metrics as (
      select metric_name,unit,count(*)::integer as sample_count,
        percentile_cont(0.50) within group(order by value)::double precision as p50,
        percentile_cont(0.75) within group(order by value)::double precision as p75,
        percentile_cont(0.95) within group(order by value)::double precision as p95
      from measurements group by metric_name,unit
    ), route_metrics as (
      select route,metric_name,unit,count(*)::integer as sample_count,
        percentile_cont(0.50) within group(order by value)::double precision as p50,
        percentile_cont(0.75) within group(order by value)::double precision as p75,
        percentile_cont(0.95) within group(order by value)::double precision as p95,
        max(measured_at) as last_measured_at
      from measurements group by route,metric_name,unit
    )
    select jsonb_build_object(
      'days',v_days,
      'sampleCount',(select count(*) from measurements),
      'routeCount',(select count(distinct route) from measurements),
      'lastMeasuredAt',(select max(measured_at) from measurements),
      'metrics',coalesce((select jsonb_agg(jsonb_build_object(
        'metricName',metric_name,'unit',unit,'sampleCount',sample_count,
        'p50',p50,'p75',p75,'p95',p95
      ) order by metric_name) from global_metrics),'[]'::jsonb),
      'routes',coalesce((select jsonb_agg(jsonb_build_object(
        'route',route,'metricName',metric_name,'unit',unit,'sampleCount',sample_count,
        'p50',p50,'p75',p75,'p95',p95,'lastMeasuredAt',last_measured_at
      ) order by route,metric_name) from route_metrics),'[]'::jsonb)
    )
  );
end;
$$;

revoke all on function finance.performance_dashboard(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function finance.performance_dashboard(uuid,uuid,integer) to service_role;
