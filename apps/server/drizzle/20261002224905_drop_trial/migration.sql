-- SPDX-License-Identifier: EUPL-1.2
-- trial_item_owner belongs to asys_lookup (FORCE RLS binds the table owner), so it can only be
-- dropped as that role. The RESET ROLE must stay in this file: drizzle runs all pending
-- migrations in one transaction, so a SET ROLE left open would leak into later migrations.
SET ROLE asys_lookup;
--> statement-breakpoint
DROP FUNCTION trial_item_owner(uuid);
--> statement-breakpoint
RESET ROLE;
--> statement-breakpoint
DROP POLICY "trial_items_owner" ON "trial_items";--> statement-breakpoint
DROP TABLE "trial_items";