alter role authenticator set pgrst.db_schemas = 'public, graphql_public, finance, approval';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';
