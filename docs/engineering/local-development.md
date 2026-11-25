# Local development

**Goal:** one command to start React, NestJS and local PostgreSQL. AWS compute services and Neon are **not** needed for normal development.

## Set up Node.js and pnpm on macOS

Open Terminal in the repository root, the folder containing `package.json`. Run `node --version`. If it shows `v26.13.0`, skip to **Install pnpm**.

### Use Homebrew

If you manage Node.js with Homebrew, install the Node 26 formula and select it for this terminal:

```bash
brew install node@26
export PATH="$(brew --prefix node@26)/bin:$PATH"
node --version
```

The project pins `v26.13.0`. Homebrew can update the patch version it supplies. If the version still differs, use nvm below to install the exact version. If you need the Homebrew selection in a new terminal, run the `export PATH` line there too.

### Use nvm for the exact Node.js version

If `command -v nvm` prints nothing, follow the [official nvm installation instructions](https://github.com/nvm-sh/nvm#installing-and-updating). Open a new Terminal window and return to the repository root. Then install and activate the version recorded in `.nvmrc`.

```bash
nvm install
nvm use
node --version
```

### Install pnpm

Node.js includes npm. Use it to install the pnpm version pinned in `package.json`.

```bash
npm install --global pnpm@11.25.0
pnpm --version
```

The version should be `11.25.0`. If a new terminal reports `command not found: pnpm`, select the same Node.js installation again using the Homebrew `export PATH` line or `nvm use`.

## Run the full stack

Start Docker with the Compose plugin available. From the repository root, copy the example environment file once, install the dependencies, and start the stack.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev:up
```

`pnpm dev:up` waits for PostgreSQL to accept connections, then starts React and NestJS in parallel. The API loads the root `.env` if present. Open [the local web app](http://localhost:5173) and check health through the Vite proxy:

```bash
curl -i http://127.0.0.1:5173/api/health
```

The web app should show its signed-out screen. For the health request, expect HTTP 200 with `{"status":"ok"}`. With the web and API processes still running, run `pnpm dev:down` in another terminal and repeat the request. `/api/health` returns HTTP 503 with `{"status":"unavailable"}` when PostgreSQL is unreachable or `DATABASE_URL` is missing.

To end a development session, press Ctrl+C in the startup terminal and stop PostgreSQL:

```bash
pnpm dev:down
```

The `salesOpDb` service listens on host port `15433` and stores its data in the Docker volume `sales_operations_postgres_data` between sessions. If you already have a local `.env`, update the port in both `DATABASE_URL` and `DIRECT_URL`. With Docker running, use `pnpm integration-tests` to check API health with PostgreSQL online and offline. Each run starts a separate Compose project with its own temporary database and automatically assigned port. The test removes that project when it finishes.

With Docker running, `pnpm check` runs lint, type checking, unit tests, integration tests and the build. Run `node scripts/check-docs.mjs` to validate the documentation scaffold. See [validation checks and rollout](delivery.md#validation-checks-and-rollout) for CI requirements.

After changing API source, stop the app processes with `Ctrl+C` and rerun `pnpm dev:up`.

## Local environment files

Use the repository-root `.env` for all local React and NestJS configuration. Add new application keys to the root `.env.example` template. Define each shared public setting once under its `VITE_` name. Map that value to the corresponding backend setting in local NestJS configuration. Reserve `VITE_` for values safe to expose in the browser. See the [hosting decision](../decisions/0003-hosting.md#application-configuration) for deployed configuration.

Use `.env.aws` for infrastructure setup details such as the AWS account, SSO profile, stack name and Google secret reference. Git ignores both populated files and allows the two example templates to be committed. Vite's `envDir` points at the repository root so it loads the same `.env` as NestJS.

## Environments

| | Local | CI | Public demo |
| --- | --- | --- | --- |
| Web/API | Vite + NestJS HTTP | Ephemeral test runner | S3/CloudFront + Lambda |
| Database | Docker PostgreSQL | Temporary PostgreSQL | Neon PostgreSQL |
| Login (from M2) | Development Cognito User Pool | Mocked JWT/JWKS boundary | Separate demo Cognito User Pool |

Vite proxies `/api` to NestJS. The demo routes `/api/*` through CloudFront to API Gateway.

## Cognito prerequisite (from M2)

Follow the [AWS and Cognito development runbook](aws-cognito-development.md) to set up the development User Pool and public app client. Configure the **public** issuer/domain/client ID in local environment settings; do not put a client secret in React. Live login requires an internet connection. Local backend validates tokens and checks membership in local PostgreSQL.

Without Cognito settings the web app shows its signed-out screen with sign-in disabled. CI identity tests use controlled token fixtures.

## Identity schema

With the local PostgreSQL service running, apply the committed migrations using
`pnpm --filter @ai-sales-operations/api prisma:migrate:local`. This command reads
`DIRECT_URL` from the root `.env`. The API uses `DATABASE_URL` for requests.
For protected routes, set `COGNITO_USER_POOL_ID`, `VITE_COGNITO_ISSUER`, `VITE_COGNITO_CLIENT_ID`
and `VITE_COGNITO_API_RESOURCE_URL` in that same file.

Keep schema-generated SQL intact. When a database rule requires custom SQL,
place it in its own later timestamped migration directory as `migration.sql`.
Prisma applies both migrations in order through the same command.

### Protected web shell smoke test

1. Start the local stack with `pnpm dev:up` after applying the migrations. Open
   `http://localhost:5173/` so the browser uses the origin registered in Cognito.
2. Select **Continue to sign in**. In Managed Login, register a synthetic native
   account using a test inbox you control, verify the email, and sign in.
   Confirm the app opens **Create organisation** and **Messages** shows the user ID.
   In **Create organisation**, create an
   organisation, and verify that its overview shows the **admin** role.
3. Open a separate browser session and sign in with the configured synthetic
   Google test account. Copy its application user ID from **Messages**.
   In the administrator's organisation workspace, select **Settings**.
   Enter that ID under **Invite staff**, select a role, and send the invitation. Check the role and
   expiry in the confirmation. Check that **Messages** in the Google account shows a badge for the pending invitation. Refresh that inbox
   and leave that view open. Revoke the invitation as the administrator, then
   try to accept the stale invitation in the Google account's view. Confirm
   that acceptance fails and refreshing removes the invitation. Send a fresh
   invitation, accept it from the inbox, and confirm the offered role appears
   in the organisation workspace.
4. Give one synthetic account memberships in two organisations with different
   roles. Open the organisation selector and switch between them with the
   keyboard. Confirm that the route, organisation-scoped request path, and role
   all change. Visit an inaccessible organisation route and check the access
   denied message. Keep request headers and callback query strings out of
   smoke-test evidence.
5. Select **Sign out** and confirm that Managed Login returns to the signed-out
   screen. Repeat for both sign-in methods.
