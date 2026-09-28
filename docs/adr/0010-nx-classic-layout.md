# One Nx workspace on the classic path-alias layout

The repository is one Nx 23 workspace using `tsconfig.base.json` path aliases (without `baseUrl`), because Angular does not support Nx's newer project-references layout, and Nx's module-boundary rules are what keep the domain package free of Angular, Effect and Drizzle. This was chosen on the condition that it does not block TypeScript 6 or 7: TypeScript 6 works (Angular 22 requires it), and TypeScript 7 is blocked by Angular itself, whose compiler needs the TypeScript JavaScript API that 7.0 does not ship, which would equally block pnpm workspaces with the Angular CLI. Nx and typescript-eslint also still load the TypeScript 6 API, for which Nx documents installing TypeScript 6 and 7 side by side.

## Considered Options

- **pnpm workspaces with the Angular CLI and a lint rule for import boundaries**: rejected because it hits the same Angular ceiling while losing Nx's module-boundary rules, generators and caching.

## Consequences

Revisit this if Angular gains TypeScript 7 support while Nx still needs the TypeScript 6 API: Nx would then be the only blocker, and the move is to Nx's newer layout or to pnpm workspaces with the Angular CLI.
