CREATE TABLE "trial_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "trial_items_owner" ON "trial_items" AS PERMISSIVE FOR ALL TO public USING ("trial_items"."owner_id" = current_setting('app.owner_id', true)::uuid) WITH CHECK ("trial_items"."owner_id" = current_setting('app.owner_id', true)::uuid);