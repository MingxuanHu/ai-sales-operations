-- Prisma applies this custom migration after the generated identity tables exist.
-- Only pending invitations compete for a slot. Keep terminal records as receipts.
CREATE UNIQUE INDEX "invitations_pending_recipient_key"
ON "invitations" ("organisation_id", "recipient_user_id") WHERE "status" = 'pending';

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_expiry_check" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "invitations_resolution_check" CHECK (("status" = 'pending') = ("resolved_at" IS NULL));

ALTER TABLE "organisations"
  ADD CONSTRAINT "organisations_name_check" CHECK (length(btrim("name")) > 0 AND "name" = btrim("name"));
