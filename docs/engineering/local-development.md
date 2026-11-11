# Local development

**Goal:** one command to start React, NestJS and local PostgreSQL. AWS compute services and Neon are **not** needed for normal development.

## Set up Node.js and pnpm on macOS

Open Terminal in the repository root, the folder containing `package.json`. If you already have Node.js 26.13.0 active in that terminal, go straight to installing pnpm.

1. If `command -v nvm` prints nothing, install the Node Version Manager using the [official nvm instructions](https://github.com/nvm-sh/nvm#installing-and-updating). Open a new Terminal window and return to the repository root.
2. Install and activate the Node.js version recorded in `.nvmrc`. Node.js includes npm.

   ```bash
   nvm install
   nvm use
   node --version
   ```

   The version should be `v26.13.0`.

3. Use npm to install the pnpm version pinned in `package.json`. This makes the `pnpm` command available with the active Node.js installation.

   ```bash
   npm install --global pnpm@11.25.0
   pnpm --version
   ```

   The version should be `11.25.0`. If a new terminal reports `command not found: pnpm` and you use nvm, run `nvm use` from the repository root to select the project's Node.js version again.

## Run the web and API health shell

Run these commands from the repository root. The health shell runs with Node.js and pnpm alone. Docker, a `.env` file and cloud credentials are unnecessary for this step.

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
