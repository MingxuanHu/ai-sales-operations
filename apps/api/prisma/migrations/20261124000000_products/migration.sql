CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_unit_price_check" CHECK ("unit_price" >= 0 AND "unit_price" <> 'NaN'::numeric),
    CONSTRAINT "products_organisation_id_fkey" FOREIGN KEY ("organisation_id")
        REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "products_organisation_id_sku_key" ON "products"("organisation_id", "sku");
