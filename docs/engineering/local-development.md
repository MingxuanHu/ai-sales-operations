# Local development

**Goal:** one command to start React, NestJS and local PostgreSQL. AWS compute services and Neon are **not** needed for normal development.

## Run the web and API health shell

Use the Node.js version pinned in `.nvmrc` (`nvm install` and `nvm use` if using nvm) and pnpm 11.25.0, as pinned in `package.json`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The command runs the web and API scripts in parallel and streams both logs to the same terminal. Once both servers are ready, open [the local web app](http://127.0.0.1:5173). The page should show **API status · Operational**. In the browser's Network panel, reload and inspect `GET /api/health`. It should use the page origin and return HTTP 200 with `{"status":"ok"}`. Press Ctrl+C to stop both servers. After changing API source, restart `pnpm dev` to rebuild it.

Run `pnpm lint`, `pnpm typecheck`, `pnpm unit-tests`, `pnpm build` and `node scripts/check-docs.mjs` for local validation.

## Planned full-stack commands

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev:up     # Docker PostgreSQL + NestJS + Vite
pnpm check      # all five validation checks below
pnpm dev:down
```

The remaining M1 issues add `pnpm dev:up`, `pnpm dev:down`, `pnpm integration-tests` and `pnpm check`. See [validation checks and rollout](delivery.md#validation-checks-and-rollout) for CI requirements.

## Environments

| | Local | CI | Public demo |
| --- | --- | --- | --- |
| Web/API | Vite + NestJS HTTP | Ephemeral test runner | S3/CloudFront + Lambda |
| Database | Docker PostgreSQL | Temporary PostgreSQL | Neon PostgreSQL |
| Login (from M2) | Development Cognito User Pool | Mocked JWT/JWKS boundary | Separate demo Cognito User Pool |

Vite proxies `/api` to NestJS. The demo routes `/api/*` through CloudFront to API Gateway.

## Cognito prerequisite (from M2)

Create a development User Pool and public app client, enable Managed Login and Authorization Code + PKCE, and allow localhost redirect/logout URLs. Configure the **public** issuer/domain/client ID in local environment settings; do not put a client secret in React. Live login requires an internet connection. Local backend validates tokens and checks membership in local PostgreSQL.

M1 stays runnable without Cognito; CI identity tests use controlled token fixtures. Never enable a test-auth bypass in a public deployment.
