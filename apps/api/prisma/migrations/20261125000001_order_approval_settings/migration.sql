-- An empty settings object uses the application defaults.
ALTER TABLE "organisations" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}';

-- Existing orders were evaluated at 10%. Backfill them before requiring an explicit snapshot.
ALTER TABLE "sales_orders" ADD COLUMN "approval_threshold_percent" DECIMAL(5,2) NOT NULL DEFAULT 10;
ALTER TABLE "sales_orders" ALTER COLUMN "approval_threshold_percent" DROP DEFAULT;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_approval_threshold_range"
    CHECK ("approval_threshold_percent" BETWEEN 0 AND 100);
