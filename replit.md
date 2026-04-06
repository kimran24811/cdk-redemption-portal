# Workspace

## Overview

pnpm workspace monorepo using TypeScript. CDK Redemption Portal — a single-page web app for activating subscription CDK keys via keys.ovh API.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

- **cdk-portal** (`artifacts/cdk-portal/`): React + Vite frontend, dark-themed CDK redemption portal at `/`
- **api-server** (`artifacts/api-server/`): Express backend proxying keys.ovh API at `/api`

## Keys.ovh Integration

- API key stored as `KEYS_OVH_API_KEY` secret
- Backend routes in `artifacts/api-server/src/routes/keys.ts`
- Proxied endpoints: `/api/keys/products`, `/api/keys/balance`, `/api/keys/activate`, `/api/keys/orders`, `/api/keys/orders/:orderNumber`, `/api/keys/purchase`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
