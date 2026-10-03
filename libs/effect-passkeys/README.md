<!-- SPDX-License-Identifier: MIT -->

# @ionaru/effect-passkeys

Passkey (WebAuthn) sign-in for [Effect](https://effect.website) `HttpApi` servers, modelled on [fresh-passkeys](https://github.com/Ionaru/fresh-passkeys). The library owns the parts that must be exactly right: the WebAuthn ceremonies, the challenges, the signature counters and the passkey endpoints. The host owns everything specific to it: users, sessions, storage and the shape of its responses. The two meet through a storage port, a unit of work and a few hooks.

WebAuthn itself is done by [SimpleWebAuthn](https://simplewebauthn.dev) (`@simplewebauthn/server`, installed from JSR).

## Entries

| Import                            | Contents                                                                                                            | Runs in                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `@ionaru/effect-passkeys/api`     | the errors, the schemas and `makePasskeyGroup`, which builds the passkey `HttpApiGroup`                             | servers and browsers (only `effect` is imported) |
| `@ionaru/effect-passkeys/server`  | the services the host provides or implements, the ceremony Effects, `makePasskeyHandlers` and `passkeyRouterConfig` | servers                                          |
| `@ionaru/effect-passkeys/testing` | a software authenticator that produces real, verifiable responses, an in-memory store and a recording unit of work  | tests (uses `node:crypto`)                       |

A browser client entry (`/client`) follows when the ASYS PWA needs it.

## The endpoints

`makePasskeyGroup(identifier, session, options)` returns a group with eight endpoints. The library fixes their identifiers and paths; the host chooses the group identifier, an optional prefix, extra payload fields for registration, the success and extra error schemas of the two finish endpoints, and the session middleware that protects the last four.

| Identifier             | Method and path                  | Answers                                                                                                       |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `registerOptions`      | POST `/register/options`         | `{ challengeId, options }`; the host's begin errors                                                           |
| `register`             | POST `/register`                 | the host's success; 400 challenge invalid, 401 verification failed, 409 already registered, the host's errors |
| `authenticateOptions`  | POST `/authenticate/options`     | `{ challengeId, options }`                                                                                    |
| `authenticate`         | POST `/authenticate`             | the host's success; 400, 401, 404 unknown credential, the host's errors                                       |
| `addOptions` (session) | POST `/passkeys/options`         | `{ challengeId, options }`                                                                                    |
| `add` (session)        | POST `/passkeys`                 | 201 with the passkey; 400, 401, 409                                                                           |
| `list` (session)       | GET `/passkeys`                  | the user's passkeys                                                                                           |
| `remove` (session)     | DELETE `/passkeys/:credentialId` | 204; 404, 409 when it is the last passkey                                                                     |

Every begin answer is `{ challengeId, options }`: hand `options` to `@simplewebauthn/browser` and send `challengeId` back with the finish request. `options` is schema-typed as an object with a `challenge`; at runtime it is passed through as JSON.

## What the host provides

On the server the host supplies four services and the hooks:

- **`PasskeyConfig`**: `{ rpId, rpName, origin, keepLastPasskey, defaultPasskeyName }`. `origin` is the exact origin browsers report, for example `https://app.example.com`.
- **`PasskeyStore`**, the storage port. Its methods return Effects without an error channel (the host turns its own failures into defects):
  - `findPasskey(credentialId)`: the passkey with that id, whichever user owns it;
  - `listPasskeys(userId)` and `userName(userId)`;
  - `createPasskey(passkey)`: `Created`, or `Duplicate` when the credential id is already stored;
  - `updateCounter(credentialId, expected, next, usedAt)`: a compare-and-set, `true` when it changed the row (counters are unsigned 32-bit values, so store them in a 64-bit column);
  - `deletePasskey(userId, credentialId, keepLast)`: atomic; `NotFound`, `LastPasskey` (nothing deleted) or `Deleted`.
- **`PasskeyUnitOfWork`**: `run(userId, effect)` runs work atomically for one user, typically a database transaction. Sign-in runs the counter update and the host's `onAuthenticated` in one run; adding and removing a passkey run in one too. `PasskeyUnitOfWork.none` runs the effect as is.
- **`PasskeyChallenges`**: `PasskeyChallenges.memory()` keeps challenges in memory for 5 minutes, takes each once, and partitions them by purpose (at most 1,000 each), so a flood of anonymous sign-in starts cannot evict a registration in progress. A server with several processes provides a shared store instead.
- **The hooks**, given to `makePasskeyHandlers(api, group, { hooks, currentUserId })`:
  - `onRegisterBegin(payload)`: check the host's payload (an invitation token, a name) and return `{ userId, userName }`. The user id must identify a new account, never an existing one; it becomes the WebAuthn user handle (at most 64 UTF-8 bytes).
  - `onRegistered(registration, payload)`: create the account with its first passkey (`registration.passkey`), usually start a session, and return the host's success value. The library stores nothing here, so the account and its first passkey can be written in one transaction. The host must store the passkey under a unique credential id and fail with `PasskeyAlreadyRegistered` when it is a duplicate: only the store can tell.
  - `onAuthenticated(passkey)`: start a session and return the host's success value. It runs inside the unit of work, after the counter update.
  - `onRemoved?(removed)`: optional, inside the removal's unit of work; it may use the services the session middleware provides, for example to end the user's other sessions.
  - `currentUserId`: an Effect that reads the signed-in user's id from the services the session middleware provides.

The handler layer requires the four services, the session middleware's implementation and whatever the hooks need.

**Router configuration.** Effect's router skips path parameters longer than 100 characters, while credential ids may have up to 1,366. Pass `passkeyRouterConfig` as `routerConfig` to `HttpRouter.serve` and `HttpRouter.toWebHandler`, or removing a passkey with a long id answers 404.

## Fixed policy

- Discoverable credentials (resident keys) with user verification required, attestation `none`, algorithms EdDSA, ES256 and RS256, and a 5-minute ceremony timeout.
- A challenge is keyed by its own value, bound to its purpose (and user), used once, and expires after 5 minutes.
- Registration requires the credential id inside the authenticator data to equal the response's `id` and to be at most 1023 bytes, and keeps only the known transports.
- Sign-in looks the passkey up by its credential id, requires `rawId === id`, checks the user handle when the authenticator returns one, verifies against the stored key and counter, and updates the counter by compare-and-set, so a replayed or cloned assertion fails.
- Verification failures never carry SimpleWebAuthn's messages, which may echo input.

## Sketch

```ts
const Passkeys = makePasskeyGroup('passkeys', Authentication, {
  prefix: '/v1/auth',
  registerBegin: { token: InviteToken, name: Name },
  registerBeginErrors: [InviteInvalid],
  registerFinishSuccess: Welcome,
  authFinishSuccess: Me,
});

const Api = HttpApi.make('app').add(Passkeys /* , other groups */);

const PasskeysLive = makePasskeyHandlers(Api, Passkeys, {
  hooks: { onRegisterBegin, onRegistered, onAuthenticated, onRemoved },
  currentUserId: CurrentUser.useSync((user) => user.id),
});
```

## Testing

`makeSoftAuthenticator({ origin, rpId })` registers and signs like a real ES256 authenticator, with overrides for flags, counters, origins, algorithms and credential id lengths, so ceremonies are tested against SimpleWebAuthn's real verification. `makeMemoryPasskeyStore()` and `makeRecordingUnitOfWork()` record what ran where.

Run `nx test effect-passkeys` for the library's runtime and type tests.

## Licence

MIT. The text is in `LICENSE`.
