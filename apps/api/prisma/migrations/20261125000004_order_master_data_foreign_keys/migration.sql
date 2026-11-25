BEGIN;

-- Index the referencing columns so PostgreSQL can check for dependent orders on delete.
CREATE INDEX "sales_orders_customer_id_idx" ON "sales_orders" ("customer_id");
CREATE INDEX "order_lines_product_id_idx" ON "order_lines" ("product_id");

-- Validate existing references and reject deletion of a referenced customer or product.
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
