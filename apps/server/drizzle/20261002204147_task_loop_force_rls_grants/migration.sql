-- SPDX-License-Identifier: EUPL-1.2
-- drizzle-kit cannot emit FORCE ROW LEVEL SECURITY: without it the table owner bypasses the policy.
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "areas" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "task_blockers" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "change_log" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "change_counters" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "users", "settings", "areas", "tasks", "review_items", "change_counters" TO asys_app;
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON "task_blockers" TO asys_app;
--> statement-breakpoint
GRANT SELECT, INSERT ON "change_log", "idempotency_keys" TO asys_app;
