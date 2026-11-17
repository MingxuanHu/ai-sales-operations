# Demo API release

The API starts as TypeScript in `apps/api/src`. You build and test it locally,
then use AWS CDK to prepare the instructions and files for AWS to deploy.

```text
TypeScript + Prisma schema → compiled JavaScript → build/demo-api
build/demo-api + CDK stack → cdk.out → S3 + CloudFormation change set
Approved change set → Lambda + API Gateway → HTTPS smoke tests
```

## 1. Check the local code

Start from a clean checkout of the source revision you plan to release. Use
the repository's pinned Node.js and pnpm versions and make sure Docker is
running for the PostgreSQL integration tests. Run these commands from the
repository root.

```sh
pnpm install --frozen-lockfile
pnpm check
git rev-parse HEAD
```

Save the Git revision printed by the last command. It identifies the source
that produced this release.

## 2. Build the Lambda package

```sh
pnpm --filter @ai-sales-operations/api run package:lambda
```

`--filter` selects the API workspace package. Its packaging script does three
things in order.

1. Prisma generates the database client from `apps/api/prisma/schema.prisma`.
   The TypeScript compiler then writes the API and generated client as
   JavaScript to `apps/api/dist`.
2. pnpm assembles those files and their runtime dependencies in
   `build/demo-api`. The script replaces that build directory on each run and
   checks the result for environment files, symbolic links, and the Lambda
   package size limit.
3. The package is ready for Lambda to load `dist/lambda.js` and invoke its
   exported `handler`. That handler uses the same NestJS application as local
   development. The Express adapter turns API Gateway events into requests
   that Nest can handle without opening a listening port.

The demo uses Node.js 26 on Lambda arm64. Prisma's PostgreSQL adapter and
generated client use JavaScript and WebAssembly. The package also includes
the version of the AWS SDK SSM client pinned by the API.

## 3. Test the packaged handler

```sh
NODE_OPTIONS=--experimental-require-module node --test scripts/test-api-artifact.mjs
```

In shells such as zsh and bash, `NAME=value command` sets an environment
variable for that command only. Here `NODE_OPTIONS` is the uppercase name
that Node.js looks for when it starts. The shell passes
`--experimental-require-module` to Node through that variable, then runs
the test file via `node --test`. The setting expires when the command ends.

The test copies the package outside the workspace and calls its handler with
simulated API Gateway events. It mocks the SSM request. The flag matches the
CDK stack's Lambda setting and lets the compiled CommonJS code load NestJS's
ES modules. AWS excludes functions using this experimental feature from the
Lambda SLA and AWS Support.
[Lambda Node.js runtime settings](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-experimental-features)

## 4. Give CDK the demo settings and synthesize

Set `DEMO_DATABASE_URL_PARAMETER` in the root `.env.aws` to the parameter
name created by the Neon setup. Verify that it is a Standard SecureString in
the demo account and Region using the AWS-managed `aws/ssm` key. A
customer-managed key requires a separately reviewed key grant. Apply any
pending migrations through the Neon release procedure.
[Neon demo runbook](../../docs/engineering/neon-demo.md)

Replace the placeholders below with the public outputs from
`SalesOperationsDemoCognito`. These three assignments use the same shell
syntax as `NODE_OPTIONS` and apply to the synthesis command only. CDK uses
`DEMO_WEB_ORIGIN` from `.env.aws` to derive the expected token audience by
adding `/api`.

```sh
COGNITO_USER_POOL_ID='<UserPoolId>' \
COGNITO_ISSUER='<Issuer>' \
COGNITO_APP_CLIENT_ID='<AppClientId>' \
pnpm --filter @ai-sales-operations/infra-api exec cdk synth --strict --no-lookups --quiet
```

Synthesis runs the local CDK program and writes the **cloud assembly** to
`infra/api/cdk.out`. It contains the CloudFormation template that describes
the AWS resources, a copy of the Lambda files, and an asset manifest that
tells CDK how to upload them. Synthesis itself creates no AWS resources.
Record the Lambda file asset ID from `SalesOperationsDemoApi.assets.json`
alongside the Git revision from step 1. Keep the reviewed assembly and its
staged files in protected release storage for rollback.

## 5. Prepare and review the AWS change set

Before provisioning, check the Sydney account's Lambda concurrency quota,
Neon connection capacity, and current regional prices. The stack uses a
512 MiB Lambda with a 15-second timeout and an API limit of 5 requests per
second with a burst of 10. API Gateway charges depend on requests and data
transfer. Lambda charges depend on invocations and duration. Standard
Parameter Store interactions at standard throughput carry no additional
charge. CloudWatch retains Lambda logs for one week.
[HTTP API quotas](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html)
· [Lambda quotas](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html)
· [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
· [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
· [Parameter Store pricing](https://aws.amazon.com/systems-manager/pricing/)

With deployment and IAM authorization, sign in with the demo AWS profile.
Set `AWS_PROFILE` and `AWS_REGION` in your shell to match the demo target
in `.env.aws`. From the repository root, choose a distinct change set name
for this release and prepare it using the assembly from step 4.

```sh
change_set=demo-api-release-1
pnpm --filter @ai-sales-operations/infra-api exec cdk --app cdk.out deploy \
  SalesOperationsDemoApi --method prepare-change-set --change-set-name "$change_set" \
  --require-approval never
aws cloudformation describe-change-set \
  --stack-name SalesOperationsDemoApi --change-set-name "$change_set"
```

CDK archives the Lambda files, uploads them to the CDK bootstrap S3 bucket,
and asks CloudFormation to prepare a **change set**, a preview of proposed
resource changes. `prepare-change-set` stops before applying them.
`--require-approval never` suppresses CDK's interactive prompt during
preparation. Review the proposed additions, updates, and replacements before
execution. Check the HTTP API integration, Lambda settings, and execution
role. Its `ssm:GetParameter` permission should cover only the configured
parameter.

## 6. Execute the reviewed change set and test HTTPS

```sh
aws cloudformation execute-change-set \
  --stack-name SalesOperationsDemoApi --change-set-name "$change_set"
```

In CloudFormation, wait for `CREATE_COMPLETE` on a first release or
`UPDATE_COMPLETE` on an update. CloudFormation points Lambda at the
uploaded package and connects API Gateway to it. The `ApiOrigin` stack
output is the base HTTPS URL for the API.

On the first request in a new Lambda execution environment, the handler
fetches the pooled database URL from SSM before starting NestJS and Prisma.
When Lambda reuses that environment, requests reuse the initialized
application and database pool.

Use the `ApiOrigin` URL and demo Cognito tokens to run the checks below.
Record the origin and status codes, keeping tokens and identity details out
of the release record.

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
smoke tests. On a first release, keep the API out of the frontend rollout
until a reviewed fix passes verification.
