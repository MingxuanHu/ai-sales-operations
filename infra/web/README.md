# Allocate the demo HTTPS origin

This is the web stack for [issue #24](../../docs/milestones/M03-01-first-cloud-deploy.md#1-allocate-the-aws-managed-demo-https-origin).
It uses the shared `AWS_ACCOUNT_ID` and
`AWS_REGION` from the root `.env.aws`. Use the AWS CLI profile authorised for
that account and Region. See the [AWS setup runbook](../../docs/engineering/aws-cognito-development.md)
for CLI access and CDK bootstrap.

From the repository root, run these local checks:

```sh
pnpm typecheck
pnpm --filter @ai-sales-operations/infra-web unit-tests
pnpm --filter @ai-sales-operations/infra-web exec cdk synth --strict SalesOperationsDemoWeb
```

## Deploy and verify

Before provisioning, verify the profile points to the intended account, check
current AWS costs and quotas, and review a CloudFormation change set before
execution. CDK can prepare a change set with `cdk deploy --method prepare-change-set`
from this package, using the authorised profile. Review the S3 bucket policy
and the CloudFront origin access control in the change set.

After authorised execution, read the outputs from the
`SalesOperationsDemoWeb` stack. Use the configured profile and Region for the
S3 upload. From the repository root:

```sh
aws s3 cp infra/web/placeholder/index.html "s3://${web_assets_bucket}/index.html" \
  --profile "$aws_profile" --region "$aws_region" \
  --content-type text/html --cache-control no-cache

curl --fail --silent --show-error "${demo_web_origin}/" | grep -F '<h1>AI Sales Operations Demo</h1>'
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  "https://${web_assets_bucket_regional_domain}/index.html"
```

Set the shell variables from `WebAssetsBucketName`,
`WebAssetsBucketRegionalDomain`, and `DemoWebOrigin`, and from your AWS
profile and Region. Expect the placeholder heading over CloudFront HTTPS
and HTTP `403` from the unsigned S3 request.

## Hand off to demo Cognito

Set `DEMO_WEB_ORIGIN` in the root `.env.aws` to the `DemoWebOrigin` output,
without a trailing slash. Record the assigned hostname and exact resolved
URLs in the issue #24 acceptance evidence:

| Setting | Value |
| --- | --- |
| Web origin | `DEMO_WEB_ORIGIN` |
| Cognito callback | `DEMO_WEB_ORIGIN` + `/auth/callback` |
| Cognito sign-out | `DEMO_WEB_ORIGIN` + `/` |
| API token audience | `DEMO_WEB_ORIGIN` + `/api` |
| Proposed Google consent-screen name | AI Sales Operations Demo |

Keep the distribution's construct ID when adding the SPA and API routing
in issue #27 so the assigned hostname remains stable. The S3 bucket is
retained if the stack is deleted.


# Issue 27 — Deploy the frontend and verify the public demo

This stack serves React from private S3 and forwards `/api/*` to the verified
API Gateway origin. Keep `WebAssets`, `WebDistribution`, and the stack name
`SalesOperationsDemoWeb` stable so updates preserve the assigned hostname:
[AI Sales Operations Demo](https://d3finwpuxpr8bj.cloudfront.net).
The bucket is retained if the stack is deleted.

## 1. Verify release prerequisites

Release order is web hostname (#24), demo identity and database migrations
(#25), verified API (#26), then this frontend (#27). Use the demo AWS profile
and Region from the root `.env.aws`; keep local application settings in the
single root `.env`. Do not change development Cognito settings to build the
demo. Public build settings below apply only to the build command.

Run from a clean checkout using the pinned Node.js and pnpm versions:

```sh
pnpm install --frozen-lockfile
pnpm check
node scripts/check-docs.mjs
git rev-parse HEAD
```

Record the revision. Read the public outputs from `SalesOperationsDemoCognito`
and `SalesOperationsDemoApi` with the authorised AWS profile. Verify the API's
`/api/health` and authenticated tenant checks before routing traffic to it.
See the [API release runbook](../api/README.md).

## 2. Build with demo identity settings

Use the deployed demo pool outputs as `ManagedLoginUrl`, `AppClientId`, and
`Issuer` below. The callback, sign-out URL and API audience must match the
registered URLs exactly. All six values are public and embedded in JavaScript.
Do not put database URLs, tokens or Google client secrets in `VITE_*` values.

```sh
VITE_COGNITO_DOMAIN='<ManagedLoginUrl>' \
VITE_COGNITO_CLIENT_ID='<AppClientId>' \
VITE_COGNITO_ISSUER='<Issuer>' \
VITE_COGNITO_REDIRECT_URI=https://d3finwpuxpr8bj.cloudfront.net/auth/callback \
VITE_COGNITO_SIGN_OUT_URL=https://d3finwpuxpr8bj.cloudfront.net/ \
VITE_COGNITO_API_RESOURCE_URL=https://d3finwpuxpr8bj.cloudfront.net/api \
pnpm --filter @ai-sales-operations/web build
```

Archive `apps/web/dist` with the source revision and public build settings in
protected release storage. Keep the previous build too, including all hashed
assets; a later build overwrites the local `dist` directory. Rebuild whenever
public settings change. Never upload the checkout or local environment files.

The demo Google project remains in Testing. Its basic sign-in scopes
(`openid email profile`) are exempt from Google's Testing user-list restriction;
Google sign-in does not require an account allowlist. NestJS checks organisation
membership separately for tenant access. Native Cognito registration is a
separate flow. Use synthetic identities for both smoke tests. See
[Google's audience rules](https://support.google.com/cloud/answer/15549945) and
the [demo identity setup](../../docs/engineering/aws-cognito-development.md#m3--demo-cognito).

## 3. Synthesize and review infrastructure

Pass `ApiOrigin` explicitly to avoid a circular dependency between web and
identity stacks. Use an HTTPS origin without a path or trailing API prefix:

```sh
DEMO_API_ORIGIN=https://hcwmvuy7t9.execute-api.ap-southeast-2.amazonaws.com \
pnpm --filter @ai-sales-operations/infra-web exec cdk synth --strict --no-lookups --quiet
```

Synthesis only writes the cloud assembly under `infra/web/cdk.out`. Archive
that assembly with the build. The default S3 behavior has a viewer-request
function for `/`, `/auth/callback`, and `/organisations/*`; it serves
`index.html` without discarding OAuth query parameters. Missing assets and
API errors retain their original status. Add new browser routes to the
function as the app grows. No distribution-wide error-to-HTML fallback is used.

API requests retain `/api/*`, allow all application HTTP methods, use HTTPS
to API Gateway, and disable caching. `AllViewerExceptHostHeader` forwards
bearer tokens, cookies and query strings while using API Gateway's host.
See [AWS's managed origin request policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html#managed-origin-request-policy-all-viewer-except-host-header).
Static responses also disable edge caching for this small demo; uploads use
`no-cache` so HTML and assets revalidate in browsers.

With deployment authorization, set `AWS_PROFILE` and `AWS_REGION` for the demo
account. Prepare and inspect a change set from the synthesized assembly:

```sh
change_set=issue-27-demo-web
pnpm --filter @ai-sales-operations/infra-web exec cdk --app cdk.out deploy \
  SalesOperationsDemoWeb --method prepare-change-set --change-set-name "$change_set" \
  --require-approval never
aws cloudformation describe-change-set \
  --stack-name SalesOperationsDemoWeb --change-set-name "$change_set"
```

Require an in-place distribution update with no replacement of the bucket,
distribution or OAC. Check the function association and API origin policies.
No new IAM role is needed. Before provisioning, check current
[CloudFront pricing](https://aws.amazon.com/cloudfront/pricing/),
[S3 pricing](https://aws.amazon.com/s3/pricing/), and
[CloudFront quotas](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-limits.html).
Configure account cost alerts with AWS Budgets and Cost Anomaly Detection
through a separately authorised billing change; confirm the recipient can
receive alerts. Record the chosen threshold and alert status before release.
Budgets warn about spend and do not cap charges. Retain the API's throttling.

## 4. Execute and publish after authorization

Set `web_assets_bucket`, `web_assets_bucket_regional_domain`, and
`demo_web_origin` from the web stack outputs. Obtain `distribution_id` from
that stack's `WebDistribution` physical resource ID. Save the current
`index.html`, assets and template in protected release storage before updating.

```sh
aws cloudformation execute-change-set \
  --stack-name SalesOperationsDemoWeb --change-set-name "$change_set"
aws cloudformation wait stack-update-complete --stack-name SalesOperationsDemoWeb

# Upload hashed assets first; publish the HTML entrypoint last. Keep old assets for open tabs.
aws s3 sync apps/web/dist/ "s3://${web_assets_bucket}/" \
  --exclude index.html --cache-control no-cache
aws s3 cp apps/web/dist/index.html "s3://${web_assets_bucket}/index.html" \
  --content-type text/html --cache-control no-cache
aws cloudfront create-invalidation --distribution-id "$distribution_id" --paths '/*'
```

Wait for the invalidation to complete and CloudFront to finish deploying before
smoke testing. Do not use `sync --delete`: open tabs and rollback need old files.
The invalidation clears any previously cached placeholder or error responses.

## 5. Record dated smoke-test results

```sh
curl --fail --silent --show-error "${demo_web_origin}/api/health"
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  "https://${web_assets_bucket_regional_domain}/index.html"
```

| Check | Expected result |
| --- | --- |
| HTTPS `/` | React sign-in screen; no placeholder |
| HTTP `/` | Redirect to HTTPS |
| Unsigned S3 `index.html` | `403` |
| Direct `/auth/callback` without an OAuth attempt | React handles the callback and shows a recoverable sign-in error |
| Missing `/assets/missing.js` | S3 error, not the React HTML document |
| `/api/health` | `200`, `{"status":"ok"}` |
| `/api/me` without a token | `401`, not an HTML shell |
| Native registration/sign-in and Google sign-in | Callback completes; protected workspace loads |
| Initial and refreshed access tokens | Demo issuer/client and exact CloudFront `/api` audience; verify in memory without recording tokens |
| Create a synthetic organisation | Creator becomes its first administrator |
| Invite another synthetic identity and accept | New membership appears and grants the invited role |
| Uninvited identity reads another organisation | `404` through CloudFront; no tenant data |
| Sign out | Workspace clears and returns to the registered demo root |

Record the date, source revision, build identity, change set, demo URL and
actual status/result per check in the [M3 specification](../../docs/milestones/M03-01-first-cloud-deploy.md#4-deploy-the-frontend-and-smoke-test-the-public-demo).
Keep identities, invitation contents, authorization codes and tokens out of
logs and screenshots. Local tests do not count as live acceptance evidence.

## Rollback

For a frontend-only failure, restore the archived previous assets first and
its `index.html` last with the same commands above, invalidate `/*`, wait for
completion and repeat smoke tests. On the first React release, the archived
placeholder is the previous build. Keep the identity configuration and API
compatible while rolling back web assets.

For a routing failure, prepare a new change set using the previous reviewed
cloud assembly and inspect it before authorised execution against the same
stack. Preserve the distribution and bucket. Restore the matching web build,
invalidate and verify again. Do not delete the stack or recreate its hostname.
