-- SPDX-License-Identifier: EUPL-1.2
-- drizzle-kit cannot emit FORCE ROW LEVEL SECURITY: without it the table owner bypasses the policy.
ALTER TABLE "sign_up_links" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "passkeys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recovery_codes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sign_in_identities" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Sign-up links are never deleted; sign_in_identities gets no grant until a later piece needs it.
GRANT SELECT, INSERT, UPDATE ON "sign_up_links" TO asys_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "passkeys", "recovery_codes", "sessions" TO asys_app;
--> statement-breakpoint
-- Pre-owner lookups: an exact key in, only (owner_id, id) out. Compare with $1: a parameter named like the column would compare the column with itself.
CREATE FUNCTION lookup_sign_up_link(key text) RETURNS TABLE(owner_id uuid, id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ select l.owner_id, l.id from public.sign_up_links l where l.token_hash = $1 $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lookup_sign_up_link(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lookup_sign_up_link(text) TO asys_app;
--> statement-breakpoint
CREATE FUNCTION lookup_session(key text) RETURNS TABLE(owner_id uuid, id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ select s.owner_id, s.id from public.sessions s where s.token_hash = $1 $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lookup_session(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lookup_session(text) TO asys_app;
--> statement-breakpoint
CREATE FUNCTION lookup_passkey(key text) RETURNS TABLE(owner_id uuid, id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ select p.owner_id, p.id from public.passkeys p where p.credential_id = $1 $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lookup_passkey(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lookup_passkey(text) TO asys_app;
--> statement-breakpoint
CREATE FUNCTION lookup_recovery_code(key text) RETURNS TABLE(owner_id uuid, id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ select c.owner_id, c.id from public.recovery_codes c where c.code_hash = $1 $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION lookup_recovery_code(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION lookup_recovery_code(text) TO asys_app;
--> statement-breakpoint
-- Unfinished jobs that have failed at least once, for /health.
CREATE FUNCTION failing_job_count() RETURNS integer
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ select count(*)::integer from public.jobs where finished_at is null and last_error is not null $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION failing_job_count() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION failing_job_count() TO asys_app;
--> statement-breakpoint
-- The lookup role may read only the key columns the functions use.
GRANT SELECT ("owner_id", "id", "token_hash") ON "sign_up_links" TO asys_lookup;
--> statement-breakpoint
GRANT SELECT ("owner_id", "id", "token_hash") ON "sessions" TO asys_lookup;
--> statement-breakpoint
GRANT SELECT ("owner_id", "id", "credential_id") ON "passkeys" TO asys_lookup;
--> statement-breakpoint
GRANT SELECT ("owner_id", "id", "code_hash") ON "recovery_codes" TO asys_lookup;
--> statement-breakpoint
GRANT SELECT ("last_error") ON "jobs" TO asys_lookup;
--> statement-breakpoint
-- ALTER ... OWNER TO needs CREATE on the schema for the new owner; only while handing over.
GRANT CREATE ON SCHEMA public TO asys_lookup;
--> statement-breakpoint
ALTER FUNCTION lookup_sign_up_link(text) OWNER TO asys_lookup;
--> statement-breakpoint
ALTER FUNCTION lookup_session(text) OWNER TO asys_lookup;
--> statement-breakpoint
ALTER FUNCTION lookup_passkey(text) OWNER TO asys_lookup;
--> statement-breakpoint
ALTER FUNCTION lookup_recovery_code(text) OWNER TO asys_lookup;
--> statement-breakpoint
ALTER FUNCTION failing_job_count() OWNER TO asys_lookup;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM asys_lookup;
