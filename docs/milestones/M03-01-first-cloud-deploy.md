# M03 - 01 — First cloud deploy

**Goal:** A synthetic user can sign in to the public HTTPS demo, create an organisation and use its protected NestJS API backed by Neon PostgreSQL.

## Scope and acceptance

- **In scope.** One demo environment with CloudFront and private S3, API Gateway HTTP API and NestJS on Lambda, a separate Cognito pool and Neon database, an AWS-assigned CloudFront HTTPS hostname, and a repeatable manual release.
- **Out of scope.** GitHub OIDC and automated releases (M4), sales features, additional hosted environments, custom domains and real customer data.
- **Infrastructure convention.** Define AWS resources in TypeScript CDK workspace packages under `infra/`. Follow `infra/cognito/` for package layout and CLI use. Commit CDK source, package configuration and any lockfile changes. Synthesize CloudFormation from CDK and review change sets before authorised execution. Keep infrastructure setup metadata in the root `.env.aws` and its template. Follow the [hosting decision](../decisions/0003-hosting.md#application-configuration) for application settings.
- **Acceptance evidence.** Record local checks, reviewed change sets and the public demo URL. Verify the private origin, HTTPS web and API paths, native and Google sign-in, sign-out, organisation creation, invitation acceptance and denial of cross-tenant access. Record deployment and rollback steps and results without exposing credentials, tokens or identity details.

Use separate demo web, identity and backend stacks so the CloudFront hostname can be allocated first and the application can be published after the API passes its checks. Pass the CloudFront origin to the identity stack and the API Gateway origin back to the web stack as explicit deployment inputs. This avoids a circular CloudFormation stack dependency.

## Issues / PRs

Track delivery in the [M3 First cloud deploy GitHub milestone](https://github.com/MingxuanHu/ai-sales-operations/milestone/3). Follow the [delivery workflow](../engineering/delivery.md#milestone-kickoff-and-github-issues).

### 1. Allocate the AWS-managed demo HTTPS origin

[Issue #24](https://github.com/MingxuanHu/ai-sales-operations/issues/24) · [PR #29](https://github.com/MingxuanHu/ai-sales-operations/pull/29) · [Demo web runbook](../../infra/web/README.md)

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

[Issue #25](https://github.com/MingxuanHu/ai-sales-operations/issues/25) · [PR #30](https://github.com/MingxuanHu/ai-sales-operations/pull/30) · [Demo Cognito and Google runbook](../engineering/aws-cognito-development.md#m3--demo-cognito) · [Demo Neon runbook](../engineering/neon-demo.md)

- **Goal.** Provide working identity and a migrated database before packaging or deploying the Lambda backend.
- **In scope.** Reuse the Cognito definitions in `infra/cognito/` with explicit development and demo configuration and separate stack identities, pools, domains and app clients. Keep development stack and construct IDs stable. Configure the demo app client with the URLs from Issue 1. In a new demo Google Cloud project, configure the approved consent-screen name, and create a web OAuth client for the demo Cognito redirect. Keep the demo Google project in Testing for M3. See the [Google project and branding guidance](https://developers.google.com/identity/siwg/best-practices). Publish the non-secret Cognito outputs used by Vite and Lambda. Provision demo Neon with a least-privilege pooled runtime role and a separate direct migration role. Store the pooled URL in SSM SecureString and apply committed migrations with `pnpm --filter @ai-sales-operations/api prisma:migrate`, supplying `DIRECT_URL` only to the authorised migration command. Run this as a manual release step for M3 and automate it before backend rollout in M4. Lambda cold starts do not run migrations.
- **Out of scope.** Lambda, API Gateway and frontend deployment.
- **Acceptance and validation.** Run `pnpm typecheck` and synthesize both environment configurations with the package-local CDK CLI. Compare development synthesis before and after the refactor and check the change set for resource replacements. After the demo application is deployed, use a controlled OAuth test client to exercise native and Google sign-in with synthetic accounts. Capture the redirect to the registered HTTPS callback in memory before browser navigation, then complete the PKCE exchange and verify issuer, client ID and the final `/api` audience on initial and refreshed tokens. Confirm sign-out targets the agreed URL. Verify migrations are current and the pooled runtime role can perform application reads and writes without schema privileges.
- **Dependencies.** Issue 1 and authorised provisioning. See the [demo identity handoff](../engineering/security.md#m3-demo-identity-handoff) and [Prisma's deployment migration guidance](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).

**Native Cognito deployment evidence.** The additions-only
`issue-25-demo-native-cognito` change set for `SalesOperationsDemoCognito` in
`ap-southeast-2` reached `CREATE_COMPLETE`. The deployed authorisation
endpoint accepted the registered CloudFront callback and PKCE challenge,
redirected to Managed Login, and the login page returned HTTP `200`.
The Managed Login base URL is
`https://sales-ops-demo-d3finwpu.auth.ap-southeast-2.amazoncognito.com`.
The Google OAuth redirect uses this base URL plus `/oauth2/idpresponse`.
Native sign-in and token exchange still need verification.

**Google configuration review.** The demo Google project is External and in
Testing. Its saved web client uses the deployed Cognito origin and the exact
`/oauth2/idpresponse` redirect. The client secret is present in Secrets
Manager. The `issue-25-register-demo-google` change set added Google to the
demo pool and reached `UPDATE_COMPLETE`. AWS readback confirmed the client ID,
scopes and attribute mappings. The original pool, domain and app client are
preserved. The `issue-25-enable-demo-google` change set updated the existing app
client in place and reached `UPDATE_COMPLETE`. AWS readback confirmed the
client supports native Cognito and Google with the same callback and sign-out
URLs. Live sign-in tests will follow application deployment.

**Neon deployment evidence.** Prisma applied both committed identity
migrations to the demo `production` branch in AWS Sydney and reported the
schema up to date. Prisma read and wrote a synthetic row through the pooled
`sales_ops_runtime` connection and rolled the transaction back. The role has
no Neon administrative membership, schema creation, temporary table, or
migration history access. The pooled URL is stored in
`/sales-operations/demo/database-url` as an SSM SecureString in
`ap-southeast-2`.

### 3. Package and deploy the NestJS backend with CDK

[Issue #26](https://github.com/MingxuanHu/ai-sales-operations/issues/26) · [PR #31](https://github.com/MingxuanHu/ai-sales-operations/pull/31) · [Demo API runbook](../../infra/api/README.md)

- **Goal.** Verify the deployed API directly through API Gateway before deploying the frontend.
- **In scope.** Share NestJS configuration, controllers, guards and services across local HTTP and Lambda entrypoints. Select a supported Lambda Node.js runtime, verify dependency compatibility and package the handler, generated Prisma client and runtime dependencies. Record the source revision and artifact version for rollback. Define API Gateway HTTP API, Lambda, throttling and scoped SSM read permissions in TypeScript CDK. Pass demo Cognito outputs as Lambda runtime settings and retrieve the pooled database URL from SSM before database initialisation. Check quotas and pricing before provisioning.
- **Out of scope.** Frontend infrastructure, browser deployment and schema changes.
- **Acceptance and validation.** Run `pnpm check` with Docker, test the packaged handler with representative HTTP API events, check the artifact excludes env files and synthesize the backend stack. After authorised deployment, call `/api/health` and a database-backed protected endpoint through the API Gateway HTTPS URL. Use demo Cognito tokens from Issue 2 with the agreed audience. Verify authorised access, missing-token rejection and denial of cross-tenant access.
- **Dependencies.** Issue 2 and separate authorisation for deployment and IAM changes. See the [system architecture](../architecture/system.md#public-demo-target-from-m3) and [hosting ADR](../decisions/0003-hosting.md).

**Deployment evidence (18 November 2026).** The additions-only
`issue-26-demo-api` change set created `SalesOperationsDemoApi` in
`ap-southeast-2`. The initial HTTPS requests returned `500` because the
Lambda loader blocked Nest's CommonJS-to-ESM imports. The reviewed
`issue-26-node-esm-interop` change set updated the Lambda code and runtime
settings and reached `UPDATE_COMPLETE`. Deployed source revision
`856b171`, CDK Lambda asset
`15037159dd0d2cc6b620bdc768d6c6a47315365abe5e97f3971d89d9de6b4653`.

The [API Gateway origin](https://hcwmvuy7t9.execute-api.ap-southeast-2.amazonaws.com)
uses a rate limit of 5 requests per second and a burst limit of 10. The
live readiness check returned `200` with `{"status":"ok"}` and `/api/me`
without a token returned `401`. Two synthetic users signed in through
Cognito Managed Login and exchanged PKCE codes for access tokens with
the demo API audience. The authenticated `/api/me` returned `200`. Creating
a synthetic organisation returned `201`. Its admin could read it (`200`)
and the other user was denied (`404`).

### 4. Deploy the frontend and smoke-test the public demo

[Issue #27](https://github.com/MingxuanHu/ai-sales-operations/issues/27) · [Demo web release runbook](../../infra/web/README.md#issue-27--deploy-the-frontend-and-verify-the-public-demo)

- **Goal.** Publish the working demo at the agreed CloudFront HTTPS URL.
- **In scope.** Update the demo web stack in TypeScript CDK while preserving the distribution and hostname from Issue 1. Serve the SPA callback and forward `/api/*` to the verified API Gateway origin with caching disabled and bearer tokens forwarded. Build Vite with the demo `VITE_*` settings and replace the placeholder with the React build. Use the demo Cognito app client for native and Google sign-in. Document release ordering, cost alerts and rollback.
- **Out of scope.** Automated releases and GitHub OIDC.
- **Acceptance and validation.** Run `pnpm typecheck`, build the web app with demo configuration and synthesize the frontend stack. After authorised deployment, verify HTTPS, private S3 access, the SPA callback and `/api/health` at the same CloudFront URL. Test native sign-in, Google sign-in with a synthetic account, sign-out, first-admin provisioning, invitation acceptance and denial of cross-tenant access with synthetic users. Record dated results and the demo URL.
- **Dependencies.** Issues 1–3 and authorised deployment.


**Local implementation evidence (18 November 2026; not deployed).** Added
SPA browser-route rewrites and an HTTPS API origin with caching disabled,
all application methods allowed, and bearer tokens forwarded. The deployed
web template and local synthesis retain `WebAssets27872646`,
`WebDistribution59C46482`, and
`WebDistributionOrigin1S3OriginAccessControl83AD2F73` logical IDs.
This template comparison does not replace review of an AWS change set.

Validation: `pnpm check` passed lint, workspace type checks, all unit tests,
the isolated PostgreSQL identity/health integration suite, and builds.
`node scripts/check-docs.mjs` passed. The web stack's five unit tests cover
private S3 access, HTTPS/OAC, uncached API forwarding, SPA rewrites with
OAuth query preservation, and invalid origin rejection.
`DEMO_API_ORIGIN=https://hcwmvuy7t9.execute-api.ap-southeast-2.amazonaws.com
pnpm --filter @ai-sales-operations/infra-web exec cdk synth --strict --no-lookups --quiet`
passed. The web build command in the release runbook passed with all six
public settings from the deployed demo Cognito outputs and CloudFront URLs.
Vite warned about an existing JavaScript chunk above 500 kB; CDK reported
unconfigured feature flags. Neither check failed. The first unit-test attempt
stopped at pnpm's noninteractive dependency setup prompt; running
`CI=true pnpm install --frozen-lockfile` restored the pinned dependencies.
Test containers were removed and no test HTTP server remained listening;
pre-existing services were left running.

**Pre-deployment status (superseded by deployment evidence below).** No AWS resources
or published S3 objects were changed for #27. Change-set review, billing alert
verification, upload/invalidation, and every live smoke check in the web
runbook remain pending, including native/Google sign-in, refreshed tokens,
sign-out, first-admin creation, invitations and cross-tenant denial through
CloudFront. The existing demo URL is
https://d3finwpuxpr8bj.cloudfront.net; local checks do not establish that it
serves this React build.


**Review corrections (18 November 2026).** Removed the stale Google account
allowlist notice from the sign-in screen and web release instructions. The
existing demo identity runbook and Google's audience rules confirm that the
configured basic sign-in scopes are exempt from the Testing user-list
restriction. Issue #27's GitHub text still contains the older restriction;
no application allowlist is implemented. Restored the issue #24 web runbook
verbatim and appended the issue #27 release procedure under its own heading.
Validation for these corrections: `pnpm lint`,
`pnpm --filter @ai-sales-operations/web unit-tests` (23 tests),
`pnpm --filter @ai-sales-operations/web typecheck`,
`node scripts/check-docs.mjs`, and `git diff --check` passed. A direct comparison
confirmed the issue #24 document remains unchanged as the README prefix.
No servers or containers were started for these checks.


**Deployment evidence (18 November 2026).** Following developer authorization,
released source revision `fe63faf` to the existing
[demo HTTPS URL](https://d3finwpuxpr8bj.cloudfront.net). `cdk diff --no-change-set`
and the prepared `issue-27-demo-web` change set showed one new SPA function,
an in-place update of distribution `E1NWV6DKPQ0SSF`, and CDK metadata.
No bucket, distribution or OAC replacement, resource removal or IAM change
was proposed. Executed the reviewed change set; `SalesOperationsDemoWeb`
reached `UPDATE_COMPLETE` and CloudFront reached `Deployed`.

Rebuilt React with the deployed demo Cognito outputs and all six demo
`VITE_*` settings, synthesized the web stack, and saved the previous template
and S3 placeholder before publication. Uploaded hashed assets before
`index.html`, then completed invalidation `I4GQSC02M6R6CZNO6Q8SRTGYJ3` for `/*`.
Release files, previous assets/template, reviewed assembly, build settings,
SHA-256 manifest, change set and smoke results are saved locally under the
ignored `build/releases/issue-27-fe63faf/` directory. The published entrypoint
SHA-256 is `ee4f160fb1fcec3a743a9e99b2d8b7fedb32927fe74bca5b206003c426e25975`.

The local release helper ran `pnpm --filter @ai-sales-operations/web build`,
`pnpm --filter @ai-sales-operations/infra-web exec cdk synth --strict --no-lookups --quiet`,
CDK change-set preparation, `aws cloudformation execute-change-set`,
`aws s3 sync` for assets, `aws s3 cp` for the entrypoint, and
`aws cloudfront create-invalidation`. The full application checks passed in
the implementation step; the subsequent review correction passed lint,
web unit tests and type checks before this release. No source code changed
during deployment.

All 12 public HTTP smoke checks passed:

| Deployed check | Observed result |
| --- | --- |
| `index.html` and all three hashed assets | `200`; each SHA-256 matches the release artifact |
| `/auth/callback` and `/organisations/synthetic-smoke` | `200`; response matches the React entrypoint |
| HTTP root | `301` to the same HTTPS root |
| Unsigned S3 `index.html` | `403` |
| Missing asset | `403`; no HTML shell substitution |
| CloudFront `/api/health` | `200`, `{"status":"ok"}` |
| CloudFront `/api/me`, missing or invalid token | `401`, JSON rather than the SPA shell |

Browser verification displayed the React sign-in screen with the corrected
Google wording. A direct callback without an OAuth attempt showed the
expected recoverable error and cleared the callback URL. The sign-in button
opened the demo Cognito Managed Login page with native and Google options,
the registered CloudFront callback, PKCE and exact `/api` resource audience.
Authenticated native/Google callback completion, token refresh, sign-out,
first-admin provisioning, invitations and cross-tenant denial through
CloudFront still require synthetic account sign-in. No tokens or identity
details were recorded.

Cost checks found an existing USD 5 monthly budget with actual-spend email
alerts at 85% and 100% and a forecast alert at 100%, plus a daily anomaly
subscription. No billing configuration changed; mailbox receipt is not
verified. Reviewed the linked CloudFront/S3 pricing and CloudFront quotas.
The Service Quotas CLI query for CloudFront returned `NoSuchResourceException`;
no quota increase was requested. The release adds only one function and one
API cache behavior to the existing distribution.

The first local execution wrapper raised a JSON parsing error after AWS
accepted `execute-change-set`, because that operation returns no response
body. Status readback confirmed `UPDATE_IN_PROGRESS`; the wrapper was fixed
to handle an empty success response and execution was not repeated. Vite's
large-chunk warning and CDK's feature-flag notice remain non-failing. No local
servers or containers were started for deployment.
