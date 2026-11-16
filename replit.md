# Versari

Versari helps university students find study partners, make campus connections, and join study or play meetups.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/versari/` — React web app, Clerk sign-in, discovery, meetups, connections, and profile onboarding
- `artifacts/api-server/src/routes/versari/` — authenticated Versari API routes
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `lib/db/src/schema/` — PostgreSQL table definitions

## Architecture decisions

- Clerk handles accounts and verified email sign-in; the app does not store passwords.
- Profiles, connection requests, and meetups are shared through the API and PostgreSQL.
- Student discovery is limited to the exact university name on the member's profile.

## Product

- Students can create a profile, choose whether they want study partners or people to play with, and discover peers at the same university.
- Members can send and answer connection requests, and create or join study and play meetups.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Email verification confirms control of an email address but does not yet restrict sign-ups to approved university email domains.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
