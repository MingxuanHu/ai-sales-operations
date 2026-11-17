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
