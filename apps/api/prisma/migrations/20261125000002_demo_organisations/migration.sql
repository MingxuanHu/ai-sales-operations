-- Existing organisations stay regular, and live orders keep their submitter.
ALTER TABLE "organisations" ADD COLUMN "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- A null submitter represents a system-generated fixture without a staff identity.
ALTER TABLE "sales_orders" ALTER COLUMN "submitted_by_user_id" DROP NOT NULL;
