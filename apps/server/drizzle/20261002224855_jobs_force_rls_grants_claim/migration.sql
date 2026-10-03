-- SPDX-License-Identifier: EUPL-1.2
-- drizzle-kit cannot emit FORCE ROW LEVEL SECURITY: without it the table owner bypasses the policy.
ALTER TABLE "jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "jobs" TO asys_app;
--> statement-breakpoint
-- Prune (a later unit) deletes old change log and idempotency key rows.
GRANT DELETE ON "change_log", "idempotency_keys" TO asys_app;
--> statement-breakpoint
-- Cross-owner claim for the job worker (ADR 0012): leases up to max_jobs due jobs and returns their keys.
CREATE FUNCTION claim_jobs(lease interval, max_jobs integer) RETURNS TABLE(id uuid, owner_id uuid)
  LANGUAGE sql VOLATILE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$
    with due as materialized (
      select d.owner_id, d.id from public.jobs d
       where d.finished_at is null and d.run_at <= now()
         and (d.claimed_until is null or d.claimed_until <= now())
       order by d.run_at
       limit max_jobs
       for update skip locked)
    update public.jobs j
       set claimed_until = now() + lease, attempts = j.attempts + 1
      from due
     where j.owner_id = due.owner_id and j.id = due.id
    returning j.id, j.owner_id
  $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION claim_jobs(interval, integer) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION claim_jobs(interval, integer) TO asys_app;
--> statement-breakpoint
-- Age of the oldest due, unfinished job for /health.
CREATE FUNCTION oldest_due_job_age() RETURNS interval
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ select coalesce(now() - min(run_at), interval '0') from public.jobs where finished_at is null and run_at <= now() $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION oldest_due_job_age() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION oldest_due_job_age() TO asys_app;
--> statement-breakpoint
-- The lookup role (BYPASSRLS, owns no tables) may touch only the columns the two functions use.
GRANT SELECT ("id", "owner_id", "run_at", "claimed_until", "finished_at", "attempts"), UPDATE ("claimed_until", "attempts") ON "jobs" TO asys_lookup;
--> statement-breakpoint
-- ALTER ... OWNER TO needs CREATE on the schema for the new owner; only while handing over.
GRANT CREATE ON SCHEMA public TO asys_lookup;
--> statement-breakpoint
ALTER FUNCTION claim_jobs(interval, integer) OWNER TO asys_lookup;
--> statement-breakpoint
ALTER FUNCTION oldest_due_job_age() OWNER TO asys_lookup;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM asys_lookup;
