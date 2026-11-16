# M03 - 01 — First cloud deploy

**Goal:** A synthetic user can sign in to the public HTTPS demo, create an organisation and use its protected NestJS API backed by Neon PostgreSQL.

## Scope and acceptance

- **In scope.** One demo environment with CloudFront and private S3, API Gateway HTTP API and NestJS on Lambda, a separate Cognito pool and Neon database, and a repeatable manual release.
- **Out of scope.** GitHub OIDC and automated releases (M4), sales features, additional hosted environments and real customer data.
- **Infrastructure convention.** Define AWS resources in TypeScript CDK workspace packages under `infra/`. Follow `infra/cognito/` for package layout and CLI use. Commit CDK source, package configuration and any lockfile changes. Synthesize CloudFormation from CDK and review change sets before authorised execution. Keep infrastructure setup metadata in the root `.env.aws` and its template. Follow the [hosting decision](../decisions/0003-hosting.md#application-configuration) for application settings.
- **Acceptance evidence.** Record local checks, reviewed change sets and the public demo URL. Verify the private origin, HTTPS web and API paths, native and Google sign-in, sign-out, organisation creation, invitation acceptance and denial of cross-tenant access. Record deployment and rollback steps and results without exposing credentials, tokens or identity details.

## Issues / PRs

Drafts for developer confirmation under the [milestone kickoff workflow](../engineering/delivery.md#milestone-kickoff-and-github-issues). Record GitHub Issue and PR links as they become available.

### 1. Package the NestJS API for Lambda

- **Goal.** Run the existing API from an API Gateway HTTP API Lambda event.
- **In scope.** Share application configuration, controllers, guards and services between the local HTTP entrypoint and the Lambda entrypoint. Package the handler, generated Prisma client and runtime dependencies. Select a supported Lambda runtime and verify package compatibility. Load deployed public settings from Lambda environment variables and obtain the runtime database connection from SSM SecureString before database initialisation.
- **Out of scope.** AWS provisioning, demo credentials and database migrations.
- **Acceptance and validation.** Run `pnpm check` with Docker. Invoke the packaged handler with representative API Gateway payloads and verify `/api/health`, authenticated requests and denied requests. Check that the artifact includes its runtime dependencies and excludes local env files.
- **Dependencies.** M2 API and tenant authorisation.

### 2. Define the public demo hosting infrastructure in CDK

- **Goal.** Synthesize a reviewable CloudFormation deployment for the web and API.
- **In scope.** Define a private S3 bucket and CloudFront origin access control, an HTTPS distribution, and API Gateway HTTP API and Lambda resources. Route `/api/*` without caching, forwarding the request data and bearer token the API needs. Serve the SPA callback while preserving API responses. Scope Lambda secret access to its runtime parameter, define request throttling and document cost alerts. Export the HTTPS demo origin for the identity configuration and document the order for binding the demo identity settings to the API.
- **Out of scope.** Deployment, demo identity resources and GitHub deployment roles.
- **Acceptance and validation.** Run `pnpm typecheck` and synthesize the demo stack using its package-local CDK CLI. Verify private bucket access, HTTPS, API path and forwarding policies, callback handling, throttling and secret permissions in the synthesized configuration. Check current quotas and pricing before any provisioning.
- **Dependencies.** Issue 1 for the Lambda artifact. See the [system architecture](../architecture/system.md#public-demo-target-from-m3) and [hosting ADR](../decisions/0003-hosting.md).

### 3. Define the separate demo Cognito configuration in CDK

- **Goal.** Give the demo its own sign-in boundary and matching API audience.
- **In scope.** Carry forward the development pool's Managed Login, public client, native registration, Google federation and token settings. Use the public HTTPS origin for the callback, sign-out and API resource URLs and a separate Google OAuth registration. Document protected storage of the provider secret and the public outputs used by Vite and Lambda.
- **Out of scope.** Deployment and changes to the development pool or OAuth registration.
- **Acceptance and validation.** Run `pnpm typecheck` and synthesize with a representative demo origin. Inspect the redirects, resource server, public client, pool protection and secret references. Compare development synthesis before and after the change to confirm the existing resources and settings are preserved.
- **Dependencies.** Issue 2 for the HTTPS origin contract. See the [development Cognito runbook](../engineering/aws-cognito-development.md) and [identity ADR](../decisions/0004-identity.md).

### 4. Release and smoke-test the demo

- **Goal.** Publish the first working public demo and leave a repeatable release runbook.
- **In scope.** Review and apply authorised CDK change sets. Set up demo Neon with a pooled runtime role and distinct direct migration role. Store the pooled URL in SSM SecureString and provide `DIRECT_URL` only to the protected migration step. Apply the committed migrations, configure Lambda from the demo identity outputs, build Vite with demo `VITE_*` settings, and publish the static assets. Document release ordering, rollback and how to verify cost alerts.
- **Out of scope.** Automated releases, GitHub OIDC and destructive migrations.
- **Acceptance and validation.** Run `pnpm check` and `pnpm --filter @ai-sales-operations/api prisma:migrate` in their respective local and protected demo environments. Check the public origin and `/api/health` over HTTPS, confirm direct S3 access is denied, then test native and Google sign-in, callback, sign-out and the protected API with two synthetic users. Verify that organisation creation grants the creator administrator access, the second user is denied before accepting an invitation, and access remains isolated across organisations. Record dated results and the deployed URL.
- **Dependencies.** Issues 1–3 and separate authorisation for deployment and any IAM changes. See the [demo identity handoff](../engineering/security.md#m3-demo-identity-handoff).
