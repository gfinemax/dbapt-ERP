-- Keep the custom schemas used by the server-side Supabase client exposed.
-- This is intentionally idempotent because the hosted Data API setting can
-- drift independently from the migration history.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, finance, approval';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
