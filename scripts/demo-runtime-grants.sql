-- Run after Prisma creates the tables. Repeating GRANT keeps the same privileges.
BEGIN;

-- List application tables explicitly to keep Prisma migration history private.
GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.products, public.customers
TO sales_ops_runtime;

COMMIT;
