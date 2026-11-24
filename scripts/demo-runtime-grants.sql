-- Run after Prisma creates the tables. Repeating GRANT keeps the same privileges.
BEGIN;

-- Backfill the existing application tables that missed grants before this release.
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.products, public.customers
TO sales_ops_runtime;

-- Defaults apply to objects created by this migration login in the public schema.
-- Prisma creates its history table before this step, so these defaults leave it private.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sales_ops_runtime;

-- A future table can use a sequence to generate IDs when the runtime inserts rows.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE ON SEQUENCES TO sales_ops_runtime;

COMMIT;
