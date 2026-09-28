# One shared server, with an owner key on every record and Postgres row-level security

ASYS starts with a single User but is built as one server that can host several Users, each owning their data: every record carries its owner, and Postgres row-level security enforces the separation so a forgotten filter cannot leak one User's data to another. Retrofitting owner keys later would touch every table and query, and the long-term vision of collaboration within an organisation needs a shared server.

## Considered Options

- **One deployment and database per person**: simpler queries and no possible cross-user leak, but rejected because it rules out the collaboration vision.

## Consequences

Row-level security only holds when nothing bypasses it: the server and its workers connect as an app role that owns no tables and lacks BYPASSRLS, a separate role owns the tables and runs migrations, and every table also gets FORCE ROW LEVEL SECURITY (written as custom SQL, since Drizzle cannot emit it yet). The current owner is set per transaction (`set_config(..., true)`) for both requests and background jobs, and an integration test connected as the app role proves that one owner's reads return nothing of another's. Collaboration within an organisation will have to revisit the rule that every record has exactly one owner.

Some lookups happen before any owner is known: a passkey credential at sign-in, a session cookie, an API token, a Google account id, a Sign-up link, a Google Calendar push channel, and the job worker claiming due jobs across owners. Each goes through its own narrow `SECURITY DEFINER` function, owned by the table-owning role, that takes the exact key and returns only the owner and the record id; the app role may execute these functions and nothing more, and policies never contain an "authenticating" escape clause.
