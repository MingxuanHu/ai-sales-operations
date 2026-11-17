# M03 - 01 — First cloud deploy

**Goal:** A synthetic user can sign in to the public HTTPS demo, create an organisation and use its protected NestJS API backed by Neon PostgreSQL.

## Scope and acceptance

- **In scope.** One demo environment with CloudFront and private S3, API Gateway HTTP API and NestJS on Lambda, a separate Cognito pool and Neon database, an AWS-assigned CloudFront HTTPS hostname, and a repeatable manual release.
- **Out of scope.** GitHub OIDC and automated releases (M4), sales features, additional hosted environments, custom domains, unrestricted Google sign-in and real customer data.
- **Infrastructure convention.** Define AWS resources in TypeScript CDK workspace packages under `infra/`. Follow `infra/cognito/` for package layout and CLI use. Commit CDK source, package configuration and any lockfile changes. Synthesize CloudFormation from CDK and review change sets before authorised execution. Keep infrastructure setup metadata in the root `.env.aws` and its template. Follow the [hosting decision](../decisions/0003-hosting.md#application-configuration) for application settings.
- **Acceptance evidence.** Record local checks, reviewed change sets and the public demo URL. Verify the private origin, HTTPS web and API paths, native and Google sign-in, sign-out, organisation creation, invitation acceptance and denial of cross-tenant access. Record deployment and rollback steps and results without exposing credentials, tokens or identity details.

Use separate demo web, identity and backend stacks so the CloudFront hostname can be allocated first and the application can be published after the API passes its checks. Pass the CloudFront origin to the identity stack and the API Gateway origin back to the web stack as explicit deployment inputs. This avoids a circular CloudFormation stack dependency.

## Issues / PRs

Track delivery in the [M3 First cloud deploy GitHub milestone](https://github.com/MingxuanHu/ai-sales-operations/milestone/3). Follow the [delivery workflow](../engineering/delivery.md#milestone-kickoff-and-github-issues).

### 1. Allocate the AWS-managed demo HTTPS origin

[Issue #24](https://github.com/MingxuanHu/ai-sales-operations/issues/24) · [Demo web runbook](../../infra/web/README.md)

- **Goal.** Obtain the final demo HTTPS URL before configuring Cognito.
- **In scope.** Define the demo web stack in TypeScript CDK with a CloudFront distribution, private S3 origin and origin access control. Use the assigned `*.cloudfront.net` hostname and default CloudFront certificate. Publish a minimal placeholder to verify HTTPS. Record the origin, `/auth/callback` redirect, root sign-out URL and `/api` token audience. Use **AI Sales Operations Demo** as the proposed Google consent-screen name.
- **Out of scope.** React deployment and API routing.
- **Acceptance and validation.** Run `pnpm typecheck` and synthesize the web stack. After authorised deployment, verify the placeholder over HTTPS and verify anonymous S3 access is denied. Record the hostname and exact identity URLs. See the [CloudFront distribution settings](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DownloadDistValuesGeneral.html).
- **Dependencies.** Authorised provisioning and IAM changes where required.

**Deployment evidence (17 November 2026).** Reviewed the `issue-24-demo-web`
change set for `SalesOperationsDemoWeb` in `ap-southeast-2`. It contained
additions only. CloudFormation reached `CREATE_COMPLETE`. The CloudFront
HTTPS request returned `200` and the response body matched the placeholder
source. An unsigned request for the same object at the S3 regional endpoint
returned `403`.

| Demo identity handoff | Verified deployment value |
| --- | --- |
| Web origin (`DEMO_WEB_ORIGIN`) | `https://d3finwpuxpr8bj.cloudfront.net` |
| Cognito callback | `https://d3finwpuxpr8bj.cloudfront.net/auth/callback` |
| Cognito sign-out | `https://d3finwpuxpr8bj.cloudfront.net/` |
| API token audience | `https://d3finwpuxpr8bj.cloudfront.net/api` |
| Proposed Google consent-screen name | AI Sales Operations Demo |

### 2. Prepare demo Cognito and Neon

[Issue #25](https://github.com/MingxuanHu/ai-sales-operations/issues/25)

- **Goal.** Provide working identity and a migrated database before packaging or deploying the Lambda backend.
- **In scope.** Reuse the Cognito definitions in `infra/cognito/` with explicit development and demo configuration and separate stack identities, pools, domains and app clients. Keep development stack and construct IDs stable. Configure the demo app client with the URLs from Issue 1. In a new demo Google Cloud project, configure the approved consent-screen name, create a web OAuth client for the demo Cognito redirect, and allowlist synthetic test accounts. Keep the demo Google project in Testing for M3. See the [Google project and branding guidance](https://developers.google.com/identity/siwg/best-practices). Publish the non-secret Cognito outputs used by Vite and Lambda. Provision demo Neon with a least-privilege pooled runtime role and a separate direct migration role. Store the pooled URL in SSM SecureString and apply committed migrations with `pnpm --filter @ai-sales-operations/api prisma:migrate`, supplying `DIRECT_URL` only to the authorised migration command. Run this as a manual release step for M3 and automate it before backend rollout in M4. Lambda cold starts do not run migrations.
- **Out of scope.** Lambda, API Gateway and frontend deployment.
- **Acceptance and validation.** Run `pnpm typecheck` and synthesize both environment configurations with the package-local CDK CLI. Compare development synthesis before and after the refactor and check the change set for resource replacements. After authorised provisioning, use a controlled OAuth test client to exercise native and Google sign-in with synthetic accounts before the React app is published. Capture the redirect to the registered HTTPS callback in memory before browser navigation, then complete the PKCE exchange and verify issuer, client ID and the final `/api` audience on initial and refreshed tokens. Use the allowlisted Google test accounts for federation. Confirm sign-out targets the agreed URL. Verify migrations are current and the pooled runtime role can perform application reads and writes without schema privileges.
- **Dependencies.** Issue 1 and authorised provisioning. See the [demo identity handoff](../engineering/security.md#m3-demo-identity-handoff) and [Prisma's deployment migration guidance](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).

### 3. Package and deploy the NestJS backend with CDK

[Issue #26](https://github.com/MingxuanHu/ai-sales-operations/issues/26)

- **Goal.** Verify the deployed API directly through API Gateway before deploying the frontend.
- **In scope.** Share NestJS configuration, controllers, guards and services across local HTTP and Lambda entrypoints. Select a supported Lambda Node.js runtime, verify dependency compatibility and package the handler, generated Prisma client and runtime dependencies. Record the source revision and artifact version for rollback. Define API Gateway HTTP API, Lambda, throttling and scoped SSM read permissions in TypeScript CDK. Pass demo Cognito outputs as Lambda runtime settings and retrieve the pooled database URL from SSM before database initialisation. Check quotas and pricing before provisioning.
- **Out of scope.** Frontend infrastructure, browser deployment and schema changes.
- **Acceptance and validation.** Run `pnpm check` with Docker, test the packaged handler with representative HTTP API events, check the artifact excludes env files and synthesize the backend stack. After authorised deployment, call `/api/health` and a database-backed protected endpoint through the API Gateway HTTPS URL. Use demo Cognito tokens from Issue 2 with the agreed audience. Verify authorised access, missing-token rejection and denial of cross-tenant access.
- **Dependencies.** Issue 2 and separate authorisation for deployment and IAM changes. See the [system architecture](../architecture/system.md#public-demo-target-from-m3) and [hosting ADR](../decisions/0003-hosting.md).

### 4. Deploy the frontend and smoke-test the public demo

[Issue #27](https://github.com/MingxuanHu/ai-sales-operations/issues/27)

- **Goal.** Publish the working demo at the agreed CloudFront HTTPS URL.
- **In scope.** Update the demo web stack in TypeScript CDK while preserving the distribution and hostname from Issue 1. Serve the SPA callback and forward `/api/*` to the verified API Gateway origin with caching disabled and bearer tokens forwarded. Build Vite with the demo `VITE_*` settings, replace the placeholder with the React build and explain that Google sign-in is available to allowlisted demo accounts. Document release ordering, cost alerts and rollback.
- **Out of scope.** Automated releases and GitHub OIDC.
- **Acceptance and validation.** Run `pnpm typecheck`, build the web app with demo configuration and synthesize the frontend stack. After authorised deployment, verify HTTPS, private S3 access, the SPA callback and `/api/health` at the same CloudFront URL. Test native sign-in, Google sign-in with an allowlisted account, sign-out, first-admin provisioning, invitation acceptance and denial of cross-tenant access with synthetic users. Record dated results and the demo URL.
- **Dependencies.** Issues 1–3 and authorised deployment.
