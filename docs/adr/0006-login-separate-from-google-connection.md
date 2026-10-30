<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Signing in to ASYS is separate from the work Google Connection

Users sign in with one of several registered passkeys, with one-time recovery codes as a backup and optionally "Sign in with Google" from any account asking only for name and email; the work Google account is a separate Connection with calendar and tasks access. An employer can disable the work account or block unapproved third-party apps in Workspace, and that must never lock a User out of their own ASYS data.

## Consequences

Slice 1 builds the passkeys and recovery codes (`libs/effect-passkeys` and `apps/server`) and accepts four known limits, also listed in [the known limits](../known-limits.md#sign-in):
- a session slides, 30 days from its last renewal, with no absolute lifetime;
- adding or removing a passkey and regenerating the recovery codes need only a valid session, with no fresh passkey check (step-up authentication);
- a flood of anonymous sign-in requests can push real sign-in challenges out of the in-memory store and delay sign-ins;
- `pnpm audit` cannot see advisories for the JSR-installed SimpleWebAuthn packages.
