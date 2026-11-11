# M01 - 01 — Bootstrap

**Goal:** From a clean checkout, a developer can start the React web app, NestJS API and local PostgreSQL using the documented commands, and verify the workspace locally and in GitHub Actions.

## Scope and acceptance

- **In scope.** pnpm TypeScript workspace, React and NestJS health shell, PostgreSQL 18 via the existing Compose service, local startup and shutdown scripts, root and app-level agent guidance, and baseline validation.
- **Out of scope.** Cognito, membership and tenant enforcement, sales features, AWS and Neon deployment, and automated AI review.
- **Acceptance evidence.** From a clean checkout, run `cp .env.example .env`, `pnpm install --frozen-lockfile` and `pnpm dev:up`. Confirm that the web app displays API health from a same-origin request and that the API can connect to local PostgreSQL. Run `pnpm check` and `pnpm dev:down`. Verify that a GitHub Actions PR run passes all five application checks and the existing documentation check without cloud credentials.

### Local routing and database lifecycle

React uses relative `/api/…` URLs in both environments. In development, Vite serves the app and forwards those requests to NestJS. In the public demo, CloudFront serves the built app from S3 and forwards API requests to API Gateway. The Vite proxy preserves the browser's same-origin request path while keeping hot reload. To rehearse static serving locally, a reverse proxy could serve the built React files and forward `/api/*` to NestJS. Validate CloudFront and API Gateway behavior in M3.

Keep one PostgreSQL database for interactive development in the existing Compose named volume. The container can stop between sessions while local data persists. Each integration test run, locally or in CI, uses a fresh PostgreSQL test database with its own connection settings and synthetic fixtures. Tear it down after the run so repeated tests start from a known state and leave developer data intact.

## Issues / PRs

Track delivery in the [M1 Bootstrap GitHub milestone](https://github.com/MingxuanHu/ai-sales-operations/milestone/1). Follow the [delivery workflow](../engineering/delivery.md#milestone-kickoff-and-github-issues).

### 1. Scaffold the pnpm workspace and web/API health shell

[Issue #4](https://github.com/MingxuanHu/ai-sales-operations/issues/4)

- **Goal.** Provide a clean-installable workspace with a React page that displays the NestJS API's health status.
- **In scope.** Verify supported versions and compatibility against the [technical baseline](../decisions/0001-technical-baseline.md), record the chosen versions, pin Node and pnpm, commit the lockfile, scaffold both apps, proxy `/api` through Vite, and add app-level `AGENTS.md` guidance. Add lint, typecheck, build and unit-test scripts with tests for the health behavior.
- **Out of scope.** Database connectivity, unified startup scripts, identity and application CI.
- **Acceptance and validation.** Run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm unit-tests` and `pnpm build`. Start both apps and verify in the browser network panel that `/api/health` uses the same origin as the page and returns the NestJS health response.
- **Dependencies.** None. See the [system architecture](../architecture/system.md) for the local request path.

### 2. Connect local PostgreSQL and add startup commands

[Issue #5](https://github.com/MingxuanHu/ai-sales-operations/issues/5)

- **Goal.** Run the full local stack with a single startup command and verify API-to-database connectivity.
- **In scope.** Reuse the Compose service and local environment example. Verify a stable Prisma version compatible with the workspace and PostgreSQL 18. Add a database-backed readiness check, API/database integration tests, `pnpm dev:up`, `pnpm dev:down` and the documented local setup.
- **Out of scope.** Business tables, identity, cloud databases and production migrations.
- **Acceptance and validation.** Follow the [local development instructions](../engineering/local-development.md) from a clean checkout. Confirm readiness with PostgreSQL available and an unavailable response when the database is offline. Run `pnpm integration-tests` twice and verify each run provisions and removes its own test database. Confirm a synthetic record in the development database survives the test runs and a `pnpm dev:down` / `pnpm dev:up` cycle.
- **Dependencies.** Issue 1. Follow the [security guidance](../engineering/security.md) for local and test database credentials.

### 3. Run baseline workspace validation in GitHub Actions

[Issue #6](https://github.com/MingxuanHu/ai-sales-operations/issues/6)

- **Goal.** Exercise the same five application checks locally and on PRs.
- **In scope.** Add `pnpm check` and GitHub Actions jobs named `lint`, `typecheck`, `unit-tests`, `integration-tests` and `build`. Use a temporary PostgreSQL service for integration tests and retain `docs-check`.
- **Out of scope.** Branch protection changes, deployments, IAM and AI review automation.
- **Acceptance and validation.** Run `pnpm check` locally. Verify all five application jobs and `docs-check` on the PR. Each job runs the real check and propagates failures. The integration job runs without demo credentials. Update the [delivery documentation](../engineering/delivery.md#validation-checks-and-rollout) to reflect the implemented checks.
- **Dependencies.** Issues 1 and 2.
