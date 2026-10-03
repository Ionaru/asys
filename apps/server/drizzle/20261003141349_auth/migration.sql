-- SPDX-License-Identifier: EUPL-1.2
CREATE TABLE "passkeys" (
	"owner_id" uuid,
	"id" uuid,
	"credential_id" text NOT NULL CONSTRAINT "passkeys_credential_id_key" UNIQUE,
	"public_key" text NOT NULL,
	"counter" bigint NOT NULL,
	"transports" jsonb NOT NULL,
	"backed_up" boolean NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	"last_used_at" timestamp(3) with time zone,
	CONSTRAINT "passkeys_pkey" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "passkeys_credential_id_check" CHECK ("credential_id" ~ '^[A-Za-z0-9_-]+$' and char_length("credential_id") <= 1366),
	CONSTRAINT "passkeys_counter_check" CHECK ("counter" >= 0)
);
--> statement-breakpoint
ALTER TABLE "passkeys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recovery_codes" (
	"owner_id" uuid,
	"id" uuid,
	"code_hash" text NOT NULL CONSTRAINT "recovery_codes_code_hash_key" UNIQUE,
	"created_at" timestamp(3) with time zone NOT NULL,
	"used_at" timestamp(3) with time zone,
	CONSTRAINT "recovery_codes_pkey" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "recovery_codes_code_hash_check" CHECK ("code_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "recovery_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sessions" (
	"owner_id" uuid,
	"id" uuid,
	"token_hash" text NOT NULL CONSTRAINT "sessions_token_hash_key" UNIQUE,
	"created_at" timestamp(3) with time zone NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "sessions_pkey" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "sessions_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sessions_expiry_check" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sign_in_identities" (
	"owner_id" uuid,
	"id" uuid,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp(3) with time zone NOT NULL,
	CONSTRAINT "sign_in_identities_pkey" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "sign_in_identities_subject_key" UNIQUE("provider","subject")
);
--> statement-breakpoint
ALTER TABLE "sign_in_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sign_up_links" (
	"owner_id" uuid,
	"id" uuid,
	"token_hash" text NOT NULL CONSTRAINT "sign_up_links_token_hash_key" UNIQUE,
	"created_at" timestamp(3) with time zone NOT NULL,
	"expires_at" timestamp(3) with time zone NOT NULL,
	"used_at" timestamp(3) with time zone,
	CONSTRAINT "sign_up_links_pkey" PRIMARY KEY("owner_id","id"),
	CONSTRAINT "sign_up_links_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "sign_up_links_expiry_check" CHECK ("expires_at" > "created_at")
);
--> statement-breakpoint
ALTER TABLE "sign_up_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "passkeys_owner" ON "passkeys" AS PERMISSIVE FOR ALL TO public USING ("passkeys"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("passkeys"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "recovery_codes_owner" ON "recovery_codes" AS PERMISSIVE FOR ALL TO public USING ("recovery_codes"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("recovery_codes"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "sessions_owner" ON "sessions" AS PERMISSIVE FOR ALL TO public USING ("sessions"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("sessions"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "sign_in_identities_owner" ON "sign_in_identities" AS PERMISSIVE FOR ALL TO public USING ("sign_in_identities"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("sign_in_identities"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "sign_up_links_owner" ON "sign_up_links" AS PERMISSIVE FOR ALL TO public USING ("sign_up_links"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid) WITH CHECK ("sign_up_links"."owner_id" = nullif(current_setting('app.owner_id', true), '')::uuid);