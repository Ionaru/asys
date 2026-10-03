<!-- SPDX-License-Identifier: EUPL-1.2 -->

# Asys

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ Your new, shiny [Nx workspace](https://nx.dev) is ready ✨.

[Learn more about this workspace setup and its capabilities](https://nx.dev/getting-started/intro#learn-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

## Run tasks

To run tasks with Nx use:

```sh
npx nx <target> <project-name>
```

For example:

```sh
npx nx build myproject
```

These targets are either [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Add new projects

While you could add new projects to your workspace manually, you might want to leverage [Nx plugins](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) and their [code generation](https://nx.dev/features/generate-code?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) feature.

To install a new plugin you can use the `nx add` command. Here's an example of adding the React plugin:

```sh
npx nx add @nx/react
```

Use the plugin's generator to create new projects. For example, to create a new React app or library:

```sh
# Generate an app
npx nx g @nx/react:app demo

# Generate a library
npx nx g @nx/react:lib some-lib
```

You can use `npx nx list` to get a list of installed plugins. Then, run `npx nx list <plugin-name>` to learn about more specific capabilities of a particular plugin. Alternatively, [install Nx Console](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) to browse plugins and generators in your IDE.

[Learn more about Nx plugins &raquo;](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) | [Browse the plugin registry &raquo;](https://nx.dev/plugin-registry?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Running the server

The server is one CLI, `asys`, built into `dist/apps/server/main.js`.

1. Start the database and migrate it: `docker compose up -d --wait`, then `pnpm exec drizzle-kit migrate --config apps/server/drizzle.config.ts`.
2. Put the server's keys in `.env`, next to the database ones. For development:
   - `PORT=3000`;
   - `ASYS_PUBLIC_ORIGIN=http://localhost:4200`, the exact origin the browser uses;
   - `ASYS_RP_ID=localhost`, the WebAuthn relying party id: the origin's host or a parent domain of it.
3. `pnpm exec nx serve server` builds the bundle and runs `asys serve`: the HTTP API on `PORT` and the job worker. Nx loads `.env` into the task.
4. The built CLI does not read `.env` by itself, so run it as `node --env-file=.env dist/apps/server/main.js <command>`:
   - `signup-link [--expires-in-days 7]` prints a Sign-up link for a new Owner, valid for 1 to 30 days;
   - `openapi` prints the OpenAPI document, which `pnpm exec nx run server:openapi` writes to `dist/apps/server/openapi.json`;
   - `serve` runs the server, as `nx serve` does.

Logs go to stderr and never contain error messages or query parameters. Stop `nx serve server` before running the server tests: they share the dev database, and its worker would claim their due jobs.

## Running the PWA

The PWA is the Angular app in `apps/pwa`. Its API client is generated from the server's OpenAPI document by ng-openapi-gen into `apps/pwa/src/generated/api` (gitignored, target `pwa:api-client`), and its token CSS comes from `design-tokens:css`; the build, serve and test targets run both first, and typecheck runs `pwa:api-client`.

1. `pnpm exec nx serve pwa` serves it on `http://localhost:4200` and proxies `/v1` and `/health` to the server on port 3000, passing `Origin` and the session cookie through unchanged. Start it before `nx serve server`: generating the client runs `server:openapi`, which rebuilds the server bundle that a running server uses. With the server already running, use `pnpm exec nx serve pwa --exclude-task-dependencies` (the generated client and the token CSS must exist then).
   Nx loads the root `.env` into every task, and the Angular dev server prefers its `PORT` (the API's port) over its own port option, so `apps/pwa/.env.serve` sets `PORT=4200` for the serve target.
2. Open it at `http://localhost:4200` exactly. On `http://127.0.0.1:4200` the Origin guard answers 403 and passkeys do not match the relying party id `localhost`.
3. The `__Host-` session cookie works over `http://localhost` in Chrome and Firefox, not in Safari.
4. `nx serve` runs no service worker. `pnpm exec nx run pwa:serve-sw` builds for production and serves `dist/apps/pwa/browser` with `scripts/serve-pwa.mts` on port 4200 (it fails if the port is busy), with the same proxy and a fallback to `index.html` for paths without a file extension, so the service worker, the manifest and the update prompt can be tried.
5. `pnpm exec nx test pwa` runs the unit tests (`@angular/build:unit-test`, Vitest and jsdom).

A Sign-up link from `node --env-file=.env dist/apps/server/main.js signup-link` opens the sign-up screen; a passkey needs a browser with an authenticator (Chrome 138 or later on this setup).

## CI

CI is `.github/workflows/cd.yaml`: on every push and pull request an `audit` job (`pnpm audit --prod`, against the lockfile without installing dependencies) runs first, then the jobs `lint`, `typecheck`, `build`, `test`, `format`, `licences` and `palettes` run in parallel, without Nx Cloud. Each job's steps live in `cd.yaml`. The `build` job also writes the server's OpenAPI document (`nx run server:openapi`), which proves that the server bundle loads without a `.env`. Every job except `audit` starts with the composite action `.github/actions/setup`, which runs `.github/actions/checkout` and then sets up pnpm with Node 24 and installs from the frozen lockfile. Each job's commands can be run locally in the same way; the `test` job needs the database from `compose.yaml` (`docker compose up -d --wait`) and a `.env` with its passwords.

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Useful links

Learn more:

- [Learn more about this workspace setup](https://nx.dev/getting-started/intro#learn-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Releasing Packages with Nx release](https://nx.dev/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [What are Nx plugins?](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

And join the Nx community:

- [Discord](https://go.nx.dev/community)
- [Follow us on X](https://twitter.com/nxdevtools) or [LinkedIn](https://www.linkedin.com/company/nrwl)
- [Our Youtube channel](https://www.youtube.com/@nxdevtools)
- [Our blog](https://nx.dev/blog?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
