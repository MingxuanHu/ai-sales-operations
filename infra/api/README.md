# Demo API release

The demo runs NestJS on Lambda arm64 with Node.js 26, the same Node.js major
used for local builds. The Express adapter translates API Gateway payload
format 2.0 into Nest requests without a listening port. The Prisma PostgreSQL
adapter uses JavaScript and WebAssembly, so the package does not need a native
Prisma engine built for Lambda. The AWS SDK SSM client is pinned with the
application so managed runtime SDK updates do not change its behavior.
The CommonJS output imports ESM dependencies through Lambda's
`NODE_OPTIONS=--experimental-require-module` opt-in. AWS excludes functions
using this feature from the Lambda SLA and AWS Support.
[Lambda Node.js runtime settings](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-experimental-features)

## Build and synthesize

Use a clean checkout of the reviewed source revision and the pinned Node.js
and pnpm versions. Run the following from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm --filter @ai-sales-operations/api run package:lambda
NODE_OPTIONS=--experimental-require-module node --test scripts/test-api-artifact.mjs
git rev-parse HEAD
```

The package command replaces `build/demo-api` with compiled code, generated
Prisma Client and its runtime dependencies. It checks the staged files against
the Lambda size limit and rejects environment files and symbolic links.

Set `DEMO_DATABASE_URL_PARAMETER` in the root `.env.aws` to the parameter
name created by the [Neon demo runbook](../../docs/engineering/neon-demo.md). Verify that the existing parameter is a Standard SecureString in
the demo account and Region using the AWS-managed `aws/ssm` key. The execution
role grants `ssm:GetParameter` on that parameter alone. A customer-managed key
would require a separately reviewed key grant. Use the public `UserPoolId`,
`Issuer` and `AppClientId` outputs from `SalesOperationsDemoCognito` as shown
below. The stack derives the expected token audience from `DEMO_WEB_ORIGIN`.

```sh
COGNITO_USER_POOL_ID='<UserPoolId>' \
COGNITO_ISSUER='<Issuer>' \
COGNITO_APP_CLIENT_ID='<AppClientId>' \
pnpm --filter @ai-sales-operations/infra-api exec cdk synth --strict --no-lookups --quiet
```

Record the Git revision and the file asset ID in
`infra/api/cdk.out/SalesOperationsDemoApi.assets.json` with the change set.
Keep the reviewed cloud assembly, including the staged asset, in protected
release storage for rollback.

## Review and verify the release

Before provisioning, confirm the Sydney account quotas and estimate costs
using the regional prices. The stack starts at 5 requests per second with a
burst of 10 and uses a 512 MiB Lambda with a 15-second timeout. Check available
concurrency and Neon connection capacity against expected demo traffic.
HTTP API charges depend on requests and data transfer. Lambda charges depend
on invocations and execution duration. Standard Parameter Store interactions
at standard throughput carry no additional charge. Lambda reads the parameter
once per execution environment. CloudWatch retains Lambda logs for one week.
[HTTP API quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html)
· [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
· [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
· [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
· [Parameter Store pricing](https://aws.amazon.com/systems-manager/pricing/)

With deployment and IAM authorization, use the reviewed assembly to prepare a
CloudFormation change set. Verify the HTTP API, integration, execution role
and SSM resource scope before executing it. The Lambda reads the pooled URL
before Nest initializes Prisma. Apply any migrations through the separate
[Neon release procedure](../../docs/engineering/neon-demo.md).

After CloudFormation completes, use the `ApiOrigin` output for HTTPS smoke
tests. Record status codes and the origin. Keep identity details and tokens
out of the record.

| Request | Expected result |
| --- | --- |
| `GET /api/health` | `200` and `{"status":"ok"}` |
| `GET /api/me` without a token | `401` |
| `GET /api/me` with a demo access token for the CloudFront `/api` audience | `200` |
| `GET /api/organisations/{id}` with a demo member token | `200` |
| Same organisation with a second demo identity that has no membership | `404` |

Only hand the API origin to Issue #27 after these checks pass. For an update
that fails smoke tests, use the previous reviewed cloud assembly to prepare
and execute a rollback change set against the same stack, then re-run the
smoke tests. A first release has no prior artifact. Keep it out of the
frontend rollout until a reviewed fix passes verification.
