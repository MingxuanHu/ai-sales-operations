-- Copy the trusted flag to JSONB and preserve other settings on existing demos.
UPDATE "organisations"
SET "settings" = jsonb_set("settings", '{isDemo}', 'true'::jsonb)
WHERE "is_demo" = true;
