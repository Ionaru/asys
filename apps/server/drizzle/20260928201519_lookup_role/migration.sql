-- Custom SQL migration file, put your code below! --
-- FORCE ROW LEVEL SECURITY binds the table owner too, so a SECURITY DEFINER
-- function owned by asys_owner sees no rows. The lookup functions belong to
-- asys_lookup (NOLOGIN, BYPASSRLS, owns no tables; created by the database
-- init script), which may read only the key and owner columns.
GRANT SELECT (id, owner_id) ON "trial_items" TO asys_lookup;
--> statement-breakpoint
-- ALTER ... OWNER TO needs CREATE on the schema for the new owner; only while handing over.
GRANT CREATE ON SCHEMA public TO asys_lookup;
--> statement-breakpoint
ALTER FUNCTION trial_item_owner(uuid) OWNER TO asys_lookup;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM asys_lookup;
