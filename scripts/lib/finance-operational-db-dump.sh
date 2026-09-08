#!/usr/bin/env bash
set -euo pipefail

# This script runs inside a disposable PostgreSQL 17 container. Connection
# values arrive through PG* environment variables and are never command args.

schema_excludes='information_schema|pg_*|_analytics|_realtime|_supavisor|auth|etl|extensions|pgbouncer|realtime|storage|supabase_functions|supabase_migrations|cron|dbdev|graphql|graphql_public|net|pgmq|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault'
data_excludes='information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor'

pg_dumpall \
  --roles-only \
  --role postgres \
  --quote-all-identifiers \
  --no-role-passwords \
  --no-comments \
  --no-password \
| sed -E 's/^\\(un)?restrict .*$/-- &/' \
| sed -E 's/^CREATE ROLE "(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)"/-- &/' \
| sed -E 's/^ALTER ROLE "(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)"/-- &/' \
| sed -E 's/ (NOSUPERUSER|NOREPLICATION)//g' \
| sed -E 's/^-- (.* SET "(pgaudit.*|pgrst.*|session_replication_role|statement_timeout|track_io_timing)" .*)/\1/' \
| sed -E 's/GRANT ".*" TO "(anon|authenticated|authenticator|cli_login_.*|dashboard_user|pgbouncer|postgres|service_role|supabase_.*|pgsodium_keyholder|pgsodium_keyiduser|pgsodium_keymaker|pgtle_admin)"/-- &/' \
| sed -E '/^--/d' \
| uniq > /backup/roles.sql

pg_dump \
  --schema-only \
  --quote-all-identifiers \
  --role postgres \
  --no-password \
  --exclude-schema "$schema_excludes" \
| sed -E 's/^\\(un)?restrict .*$/-- &/' \
| sed -E 's/^CREATE SCHEMA "/CREATE SCHEMA IF NOT EXISTS "/' \
| sed -E 's/^CREATE TABLE "/CREATE TABLE IF NOT EXISTS "/' \
| sed -E 's/^CREATE SEQUENCE "/CREATE SEQUENCE IF NOT EXISTS "/' \
| sed -E 's/^CREATE VIEW "/CREATE OR REPLACE VIEW "/' \
| sed -E 's/^CREATE FUNCTION "/CREATE OR REPLACE FUNCTION "/' \
| sed -E 's/^CREATE TRIGGER "/CREATE OR REPLACE TRIGGER "/' \
| sed -E 's/^CREATE PUBLICATION "supabase_realtime/-- &/' \
| sed -E 's/^CREATE EVENT TRIGGER /-- &/' \
| sed -E 's/^         WHEN TAG IN /-- &/' \
| sed -E 's/^   EXECUTE FUNCTION /-- &/' \
| sed -E 's/^ALTER EVENT TRIGGER /-- &/' \
| sed -E 's/^ALTER PUBLICATION "supabase_realtime_/-- &/' \
| sed -E 's/^ALTER FOREIGN DATA WRAPPER (.+) OWNER TO /-- &/' \
| sed -E 's/^ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin"/-- &/' \
| sed -E 's/^GRANT ALL ON FOREIGN DATA WRAPPER (.+) TO "postgres" WITH GRANT OPTION/-- &/' \
| sed -E "s/^GRANT (.+) ON (.+) \"($schema_excludes)\"/-- &/" \
| sed -E "s/^REVOKE (.+) ON (.+) \"($schema_excludes)\"/-- &/" \
| sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pg_tle").+/\1;/' \
| sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgsodium").+/\1;/' \
| sed -E 's/^(CREATE EXTENSION IF NOT EXISTS "pgmq").+/\1;/' \
| sed -E 's/^COMMENT ON EXTENSION (.+)/-- &/' \
| sed -E 's/^CREATE POLICY "cron_job_/-- &/' \
| sed -E 's/^ALTER TABLE "cron"/-- &/' \
| sed -E 's/^SET transaction_timeout = 0;/-- &/' \
| sed -E '/^--/d' > /backup/schema.sql

{
  printf 'SET session_replication_role = replica;\n\n'
  pg_dump \
    --data-only \
    --quote-all-identifiers \
    --role postgres \
    --no-password \
    --exclude-schema "$data_excludes" \
    --exclude-table auth.schema_migrations \
    --exclude-table storage.migrations \
    --exclude-table supabase_functions.migrations \
    --exclude-table storage.buckets_vectors \
    --exclude-table storage.vector_indexes \
    --schema '*' \
    --column-inserts \
    --rows-per-insert 100000 \
  | sed -E 's/^\\(un)?restrict .*$/-- &/'
  printf '\nRESET ALL;\n'
} > /backup/data.sql

if [ "$(psql --no-password --no-psqlrc --tuples-only --no-align --command "select count(*) from pg_namespace where nspname = 'supabase_migrations'")" = "1" ]; then
  pg_dump \
    --schema-only \
    --quote-all-identifiers \
    --role postgres \
    --no-password \
    --schema supabase_migrations > /backup/history_schema.sql

  pg_dump \
    --data-only \
    --quote-all-identifiers \
    --role postgres \
    --no-password \
    --schema supabase_migrations \
    --column-inserts \
    --rows-per-insert 100000 > /backup/history_data.sql
else
  printf '%s\n' '-- Source has no supabase_migrations schema.' > /backup/history_schema.sql
  printf '%s\n' '-- Source has no supabase_migrations data.' > /backup/history_data.sql
fi

psql --no-password --no-psqlrc --tuples-only --no-align --command \
  "select json_build_object(
    'serverVersion', current_setting('server_version'),
    'database', current_database(),
    'capturedAt', clock_timestamp(),
    'metrics', json_build_object(
      'expenseResolutionCount', (select count(*) from finance.expense_resolutions),
      'expenseResolutionAmount', (select coalesce(sum(total_payment_amount), 0) from finance.expense_resolutions),
      'quickExpenseCount', (select count(*) from finance.quick_expense_records),
      'voucherCount', (select count(*) from finance.vouchers),
      'approvalDocumentCount', (select count(*) from approval.documents),
      'authUserCount', (select count(*) from auth.users),
      'storageObjectCount', (select count(*) from storage.objects),
      'storageMetadataBytes', (select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end), 0) from storage.objects)
    )
  )" \
  > /backup/source-summary.private.json
