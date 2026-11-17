# M03 - 01 — First cloud deploy

**Goal:** A synthetic user can sign in to the public HTTPS demo, create an organisation and use its protected NestJS API backed by Neon PostgreSQL.

## Scope and acceptance

- **In scope.** One demo environment with CloudFront and private S3, API Gateway HTTP API and NestJS on Lambda, a separate Cognito pool and Neon database, a custom HTTPS hostname, and a repeatable manual release.
- **Out of scope.** GitHub OIDC and automated releases (M4), sales features, additional hosted environments and real customer data.
- **Infrastructure convention.** Define AWS resources in TypeScript CDK workspace packages under `infra/`. Follow `infra/cognito/` for package layout and CLI use. Commit CDK source, package configuration and any lockfile changes. Synthesize CloudFormation from CDK and review change sets before authorised execution. Keep infrastructure setup metadata in the root `.env.aws` and its template. Follow the [hosting decision](../decisions/0003-hosting.md#application-configuration) for application settings.
- **Acceptance evidence.** Record local checks, reviewed change sets and the public demo URL. Verify the private origin, HTTPS web and API paths, native and Google sign-in, sign-out, organisation creation, invitation acceptance and denial of cross-tenant access. Record deployment and rollback steps and results without exposing credentials, tokens or identity details.

## Issues / PRs

Drafts for developer confirmation under the [milestone kickoff workflow](../engineering/delivery.md#milestone-kickoff-and-github-issues). Record GitHub Issue and PR links as they become available.

### 1. Choose the demo hostname and sign-in branding

- **Goal.** Fix the public URL and Google consent-screen name before configuring identity.
- **In scope.** Choose a short hostname on a domain the developer controls, for example `https://sales-demo.<owned-domain>`, and confirm **AI Sales Operations Demo** as the proposed Google consent-screen name. Record the origin, `/auth/callback` redirect, root sign-out URL and `/api` token audience. Document DNS control, certificate validation and any Google branding or publishing prerequisites.
- **Out of scope.** Domain purchases, CloudFront deployment and application changes.
- **Acceptance and validation.** Confirm DNS control and approve the hostname, exact URLs and display name. Identify any Google verification that needs a live homepage for the public rollout. See the [CloudFront certificate requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html) and the [development Cognito runbook](../engineering/aws-cognito-development.md).
- **Dependencies.** Access to a developer-controlled domain.

### 2. Prepare demo Cognito and Neon

- **Goal.** Provide working identity and a migrated database before packaging or deploying the Lambda backend.
- **In scope.** Reuse the Cognito definitions in `infra/cognito/` with explicit development and demo configuration and separate stack identities, pools, domains and app clients. Keep development stack and construct IDs stable. Configure the demo app client with the URLs from Issue 1 and a separate Google OAuth registration using the approved consent-screen name. Publish the non-secret Cognito outputs used by Vite and Lambda. Provision demo Neon with a least-privilege pooled runtime role and a separate direct migration role. Store the pooled URL in SSM SecureString and apply committed migrations with `pnpm --filter @ai-sales-operations/api prisma:migrate`, supplying `DIRECT_URL` only to the authorised migration command. Run this as a manual release step for M3 and automate it before backend rollout in M4. Lambda cold starts do not run migrations.
- **Out of scope.** Lambda, API Gateway and frontend deployment.
- **Acceptance and validation.** Run `pnpm typecheck` and synthesize both environment configurations with the package-local CDK CLI. Compare development synthesis before and after the refactor and check the change set for resource replacements. After authorised provisioning, use a controlled OAuth test client to exercise native and Google sign-in with synthetic accounts before CloudFront exists. Capture the redirect to the registered HTTPS callback in memory before browser navigation, then complete the PKCE exchange and verify issuer, client ID and the final `/api` audience on initial and refreshed tokens. Use allowlisted Google test accounts if public branding verification needs the live site. Confirm sign-out targets the agreed URL. Verify migrations are current and the pooled runtime role can perform application reads and writes without schema privileges.
- **Dependencies.** Issue 1 and authorised provisioning. See the [demo identity handoff](../engineering/security.md#m3-demo-identity-handoff) and [Prisma's deployment migration guidance](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).

### 3. Package and deploy the NestJS backend with CDK

- **Goal.** Verify the deployed API directly through API Gateway before deploying the frontend.
- **In scope.** Share NestJS configuration, controllers, guards and services across local HTTP and Lambda entrypoints. Select a supported Lambda Node.js runtime, verify dependency compatibility and package the handler, generated Prisma client and runtime dependencies. Record the source revision and artifact version for rollback. Define API Gateway HTTP API, Lambda, throttling and scoped SSM read permissions in TypeScript CDK. Pass demo Cognito outputs as Lambda runtime settings and retrieve the pooled database URL from SSM before database initialisation. Check quotas and pricing before provisioning.
- **Out of scope.** Frontend infrastructure, browser deployment and schema changes.
- **Acceptance and validation.** Run `pnpm check` with Docker, test the packaged handler with representative HTTP API events, check the artifact excludes env files and synthesize the backend stack. After authorised deployment, call `/api/health` and a database-backed protected endpoint through the API Gateway HTTPS URL. Use demo Cognito tokens from Issue 2 with the agreed audience. Verify authorised access, missing-token rejection and denial of cross-tenant access.
- **Dependencies.** Issue 2 and separate authorisation for deployment and IAM changes. See the [system architecture](../architecture/system.md#public-demo-target-from-m3) and [hosting ADR](../decisions/0003-hosting.md).

### 4. Deploy the frontend and smoke-test the public demo

- **Goal.** Publish the working demo at the agreed custom HTTPS URL.
- **In scope.** Define private S3, CloudFront origin access control, the custom hostname and its TLS certificate in TypeScript CDK. Use an ACM certificate in `us-east-1` and wire DNS to the distribution. Serve the SPA callback and forward `/api/*` to the verified API Gateway origin with caching disabled and bearer tokens forwarded. Build Vite with the demo `VITE_*` settings, publish assets and complete any Google branding verification that requires the public site. Document release ordering, cost alerts and rollback.
- **Out of scope.** Automated releases and GitHub OIDC.
- **Acceptance and validation.** Run `pnpm typecheck`, build the web app with demo configuration and synthesize the frontend stack. After authorised deployment, verify DNS and TLS, private S3 access, the SPA callback and `/api/health` at the custom HTTPS URL. Test native and Google sign-in, the Google consent-screen name, sign-out, first-admin provisioning, invitation acceptance and denial of cross-tenant access with synthetic users. Record dated results and the demo URL.
- **Dependencies.** Issues 1–3 and authorised deployment.
