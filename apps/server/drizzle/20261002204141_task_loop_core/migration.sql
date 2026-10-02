-- SPDX-License-Identifier: EUPL-1.2
CREATE TYPE "change_entity" AS ENUM('task', 'blocker', 'area', 'review_item', 'settings');--> statement-breakpoint
CREATE TYPE "change_op" AS ENUM('put', 'remove');--> statement-breakpoint
CREATE TYPE "privacy" AS ENUM('visible', 'private', 'hidden');--> statement-breakpoint
CREATE TYPE "task_kind" AS ENUM('task', 'check_in', 'member_template');--> statement-breakpoint
CREATE TYPE "task_status" AS ENUM('open', 'done', 'dropped', 'delegated', 'skipped');--> statement-breakpoint
CREATE TYPE "voice" AS ENUM('out_loud', 'closed_door');--> statement-breakpoint
CREATE TABLE "areas" (
	"owner_id" uuid,
	"id" uuid,
	"name" text NOT NULL,
	"active_hours" jsonb NOT NULL,
	"default_privacy" "privacy",
	"version" integer NOT NULL,
	CONSTRAINT "areas_pkey" PRIMARY KEY("owner_id","id")
);
--> statement-breakpoint
ALTER TABLE "areas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "change_counters" (
	"owner_id" uuid PRIMARY KEY,
	"last_seq" bigint DEFAULT 0 NOT NULL,
	"pruned_through" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "change_counters_seq_check" CHECK (0 <= "pruned_through" and "pruned_through" <= "last_seq")
);
--> statement-breakpoint
ALTER TABLE "change_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "change_log" (
	"owner_id" uuid,
	"seq" bigint,
	"entity" "change_entity" NOT NULL,
	"entity_id" uuid,
	"op" "change_op" NOT NULL,
	"data" jsonb,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_log_pkey" PRIMARY KEY("owner_id","seq"),
	CONSTRAINT "change_log_entity_id_check" CHECK (("entity" = 'settings') = ("entity_id" is null)),
	CONSTRAINT "change_log_data_check" CHECK (("op" = 'remove') = ("data" is null))
);
--> statement-breakpoint
ALTER TABLE "change_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"owner_id" uuid,
	"key" uuid,
	"command" text NOT NULL,
	"request_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("owner_id","key")
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "review_items" (
	"owner_id" uuid,
	"id" uuid,
	"kind" text NOT NULL,
	"subjects" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp(3) with time zone NOT NULL,
	"resolved_at" timestamp(3) with time zone,
	CONSTRAINT "review_items_pkey" PRIMARY KEY("owner_id","id")
);
--> statement-breakpoint
ALTER TABLE "review_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "settings" (
	"owner_id" uuid PRIMARY KEY,
	"time_zone" text NOT NULL,
	"urgency_window_days" integer NOT NULL,
	CONSTRAINT "settings_urgency_window_check" CHECK ("urgency_window_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_blockers" (
	"owner_id" uuid,
	"id" uuid,
	"task_id" uuid NOT NULL,
	"blocker_id" uuid NOT NULL,
	CONSTRAINT "task_blockers_pkey" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "task_blockers_link_key" UNIQUE("owner_id","task_id","blocker_id"),
	CONSTRAINT "task_blockers_not_self_check" CHECK ("task_id" <> "blocker_id")
);
--> statement-breakpoint
ALTER TABLE "task_blockers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"owner_id" uuid,
	"id" uuid,
	"kind" "task_kind" NOT NULL,
	"status" "task_status" NOT NULL,
	"title" text NOT NULL,
	"notes" text NOT NULL,
	"capture_text" text NOT NULL,
	"area_id" uuid,
	"available_from_date" date,
	"available_from_time" text,
	"due_date" date,
	"due_time" text,
	"estimate_minutes" integer,
	"important" boolean,
	"voice" "voice",
	"privacy" "privacy",
	"due_move_count" integer NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"closed_at" timestamp(3) with time zone,
	CONSTRAINT "tasks_pkey" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "tasks_available_from_time_check" CHECK ("available_from_time" is null or ("available_from_date" is not null and "available_from_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "tasks_due_time_check" CHECK ("due_time" is null or ("due_date" is not null and "due_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')),
	CONSTRAINT "tasks_estimate_check" CHECK ("estimate_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"owner_id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "review_items_open_dedupe_key" ON "review_items" ("owner_id","dedupe_key") WHERE "resolved_at" is null;--> statement-breakpoint
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_task_fk" FOREIGN KEY ("owner_id","task_id") REFERENCES "tasks"("owner_id","id");--> statement-breakpoint
ALTER TABLE "task_blockers" ADD CONSTRAINT "task_blockers_blocker_fk" FOREIGN KEY ("owner_id","blocker_id") REFERENCES "tasks"("owner_id","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_area_fk" FOREIGN KEY ("owner_id","area_id") REFERENCES "areas"("owner_id","id");--> statement-breakpoint
CREATE POLICY "areas_owner" ON "areas" AS PERMISSIVE FOR ALL TO public USING ("areas"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("areas"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "change_counters_owner" ON "change_counters" AS PERMISSIVE FOR ALL TO public USING ("change_counters"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("change_counters"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "change_log_owner" ON "change_log" AS PERMISSIVE FOR ALL TO public USING ("change_log"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("change_log"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "idempotency_keys_owner" ON "idempotency_keys" AS PERMISSIVE FOR ALL TO public USING ("idempotency_keys"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("idempotency_keys"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "review_items_owner" ON "review_items" AS PERMISSIVE FOR ALL TO public USING ("review_items"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("review_items"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "settings_owner" ON "settings" AS PERMISSIVE FOR ALL TO public USING ("settings"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("settings"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "task_blockers_owner" ON "task_blockers" AS PERMISSIVE FOR ALL TO public USING ("task_blockers"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("task_blockers"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tasks_owner" ON "tasks" AS PERMISSIVE FOR ALL TO public USING ("tasks"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("tasks"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "users_owner" ON "users" AS PERMISSIVE FOR ALL TO public USING ("users"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("users"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);