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

`pnpm dev:up` waits for PostgreSQL to accept connections, then starts React and NestJS in parallel. The API loads the root `.env` if present. Open [the local web app](http://127.0.0.1:5173) and check health through the Vite proxy:

```bash
curl -i http://127.0.0.1:5173/api/health
```

The page should show **API status · Operational**. Expect HTTP 200 with `{"status":"ok"}`. With the web and API processes still running, run `pnpm dev:down` in another terminal and repeat the request. `/api/health` returns HTTP 503 with `{"status":"unavailable"}` when PostgreSQL is unreachable or `DATABASE_URL` is missing.

To end a development session, press Ctrl+C in the startup terminal and stop PostgreSQL:

```bash
pnpm dev:down
```

The `salesOpDb` service listens on host port `15433` and stores its data in the Docker volume `sales_operations_postgres_data` between sessions. If you already have a local `.env`, update the port in both `DATABASE_URL` and `DIRECT_URL`. With Docker running, use `pnpm integration-tests` to check API health with PostgreSQL online and offline. Each run starts a separate Compose project with its own temporary database and automatically assigned port. The test removes that project when it finishes.

With Docker running, `pnpm check` runs lint, type checking, unit tests, integration tests and the build. Run `node scripts/check-docs.mjs` to validate the documentation scaffold. See [validation checks and rollout](delivery.md#validation-checks-and-rollout) for CI requirements.

After changing API source, stop the app processes with `Ctrl+C` and rerun `pnpm dev:up`.

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
