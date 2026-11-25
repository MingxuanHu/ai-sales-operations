-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'approved', 'rejected', 'fulfilled');

-- CreateEnum
CREATE TYPE "order_event_kind" AS ENUM ('submitted', 'automatically_approved', 'approved', 'rejected', 'fulfilled');

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "submitted_by_user_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "customer_id" UUID NOT NULL,
    "customer_name" VARCHAR(120) NOT NULL,
    "status" "order_status" NOT NULL,
    "discount_percent" DECIMAL(5,2) NOT NULL,
    "subtotal" DECIMAL(30,2) NOT NULL,
    "total" DECIMAL(30,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "order_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("order_id","position")
);

-- CreateTable
CREATE TABLE "order_events" (
    "order_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "order_event_kind" NOT NULL,
    "actor_user_id" UUID,
    "from_status" "order_status",
    "to_status" "order_status" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("order_id","position")
);

-- CreateIndex
CREATE INDEX "sales_orders_organisation_id_created_at_id_idx" ON "sales_orders"("organisation_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "sales_orders_organisation_id_status_created_at_id_idx" ON "sales_orders"("organisation_id", "status", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_organisation_id_submitted_by_user_id_request_i_key" ON "sales_orders"("organisation_id", "submitted_by_user_id", "request_id");

-- CreateIndex
CREATE INDEX "order_events_actor_user_id_idx" ON "order_events"("actor_user_id");

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_organisation_id_submitted_by_user_id_fkey" FOREIGN KEY ("organisation_id", "submitted_by_user_id") REFERENCES "memberships"("organisation_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "application_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Keep basic numeric invariants when fixtures or other writers bypass the API.
ALTER TABLE "sales_orders"
    ADD CONSTRAINT "sales_orders_discount_range" CHECK ("discount_percent" BETWEEN 0 AND 100),
    ADD CONSTRAINT "sales_orders_total_range" CHECK ("total" BETWEEN 0 AND "subtotal");

ALTER TABLE "order_lines"
    ADD CONSTRAINT "order_lines_positive_quantity" CHECK ("quantity" > 0),
    ADD CONSTRAINT "order_lines_nonnegative_price" CHECK ("unit_price" >= 0);
