-- Custom SQL migration file, put your code below! --
-- drizzle-kit cannot emit FORCE ROW LEVEL SECURITY: without it the table owner bypasses the policy.
ALTER TABLE "trial_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO asys_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "trial_items" TO asys_app;
--> statement-breakpoint
-- Narrow pre-owner lookup (ADR 0007): takes the exact key and returns only the owner.
CREATE FUNCTION trial_item_owner(item_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ select owner_id from public.trial_items where id = item_id $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION trial_item_owner(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION trial_item_owner(uuid) TO asys_app;
