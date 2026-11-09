-- Cover the auth.users foreign key without changing the organization/time query indexes.
create index if not exists performance_measurements_user_idx
  on finance.performance_measurements(user_id);
