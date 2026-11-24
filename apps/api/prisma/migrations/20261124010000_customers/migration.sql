CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customers_organisation_id_fkey" FOREIGN KEY ("organisation_id")
        REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "customers_organisation_id_name_id_idx" ON "customers"("organisation_id", "name", "id");
