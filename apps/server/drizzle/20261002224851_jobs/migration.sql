-- SPDX-License-Identifier: EUPL-1.2
CREATE TABLE "jobs" (
	"owner_id" uuid,
	"id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"run_at" timestamp(3) with time zone NOT NULL,
	"cron" text,
	"dedupe_key" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_until" timestamp(3) with time zone,
	"last_error" text,
	"finished_at" timestamp(3) with time zone,
	"failed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "jobs_pkey" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "jobs_dedupe_key" UNIQUE("owner_id","dedupe_key"),
	CONSTRAINT "jobs_attempts_check" CHECK ("attempts" >= 0),
	CONSTRAINT "jobs_failed_check" CHECK (not "failed" or "finished_at" is not null),
	CONSTRAINT "jobs_cron_check" CHECK ("cron" is null or "finished_at" is null)
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" ("run_at") WHERE "finished_at" is null;--> statement-breakpoint
CREATE POLICY "jobs_owner" ON "jobs" AS PERMISSIVE FOR ALL TO public USING ("jobs"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("jobs"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);