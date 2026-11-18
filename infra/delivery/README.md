# Demo OIDC deployment access — issue #35

This CDK package defines `SalesOperationsDemoDelivery`, separate from the
existing API, web and Cognito stacks. It creates the `SalesOperationsDemoRelease`
role and optionally the account-wide GitHub OIDC provider. It adds no dependency
and no running compute. IAM setup and a live identity check are pending separate
developer authorization; synthesis does not apply these changes.

## Trust and inspected targets

Read-only inspection on 18 November 2026 found issue #34 closed and these
resources in account `381491963300`, Region `ap-southeast-2`:

| Target | Existing identifier |
| --- | --- |
| API Lambda | `SalesOperationsDemoApi-ApiFunctionCE271BD4-04BpZE8CXvGS` |
| Web bucket | `salesoperationsdemoweb-webassets27872646-ngmiddvdzwdm` |
| Distribution | `E1NWV6DKPQ0SSF` |
| GitHub OIDC provider | None returned by IAM list operation |

The GitHub repository API returned owner ID `20830158`, repository ID
`1452171772`, and creation date 10 November 2026. Its OIDC customization
readback returned `use_default: true`, `use_immutable_subject: true` and prefix
`repo:MingxuanHu@20830158/ai-sales-operations@1452171772`. Therefore the role
uses **StringEquals** for both:

- `aud`: `sts.amazonaws.com`
- `sub`: `repo:MingxuanHu@20830158/ai-sales-operations@1452171772:environment:demo`

An environment subject does not also contain the branch. GitHub Environment
`demo` must continue to allow only `main`; confirm its restriction before
applying IAM or running the future release workflow. The workflow must also
check `github.ref == 'refs/heads/main'` and use a trusted event. PR jobs must
have neither `environment: demo`, `id-token: write`, nor a credential step.
Do not add `pull_request_target`. Forks and jobs with a plain branch or PR
subject cannot match this trust. A job on trusted main using demo is privileged,
including a deliberately configured same-repository PR job, so workflow review
is also part of this boundary.

## Permission design and issue #36 handoff

| Actions | Resource | Purpose |
| --- | --- | --- |
| `lambda:UpdateFunctionCode`, `lambda:GetFunctionConfiguration` | Exact unqualified API function ARN | Upload a ZIP and wait for its update; inspect status/code hash |
| `s3:ListBucket`, `s3:GetBucketLocation` | Exact web bucket ARN | Compare uploads against existing files |
| `s3:PutObject`, `s3:GetObject` | Objects in that web bucket | Publish builds and verify or restore saved files |
| `cloudfront:CreateInvalidation`, `cloudfront:GetInvalidation` | Exact distribution ARN | Invalidate and wait for completion |

All granted actions support resource restrictions. The object `/*` suffix
covers changing build filenames inside one bucket; no action uses resource
`*`. No delete, configuration update, IAM, `PassRole`, STS role chaining,
CloudFormation, SSM or KMS permission is granted. `sts:GetCallerIdentity` does
not require an explicit Allow and needs no wildcard grant.

**Proposed release approach for developer review:** issue #36 should publish
application artifacts directly to the existing resources, keeping CDK
infrastructure updates as separately authorized operations. Use
`aws lambda update-function-code --zip-file fileb://...` followed by
`aws lambda wait function-updated-v2`, then web asset uploads and invalidation.
The Lambda ZIP must fit the direct-upload limit; larger artifacts require a
separately reviewed artifact bucket grant. Keep old web assets, upload HTML
last, and do not use `sync --delete`. Retain immutable API/web bundles in
GitHub Actions artifacts for release/rollback; that storage needs no AWS grant.
The release workflow and its execution belong to #36.

There are consequently **no CDK publishing or execution paths for this role**.
It cannot run the existing API/web CDK deployment commands. Do not grant
`sts:AssumeRole` on default bootstrap roles to make those commands work: a
bootstrap CloudFormation execution role may have AdministratorAccess, which
would defeat the scoped policy. If automated infrastructure deployment becomes
necessary, review a dedicated, scoped CloudFormation execution role and file
publishing path first. Preserve all existing stack/resource construct IDs.
Direct Lambda code updates must be reconciled with the desired artifact in
the next human CDK update; an old synthesized assembly could overwrite them.

Migration access remains `DEMO_DIRECT_URL` in Environment `demo`, mapped to
`DIRECT_URL` only for migrations. AWS OIDC supplies no Neon credential.
Lambda retains its existing runtime-only `ssm:GetParameter` grant for the
pooled connection. This role has no direct secret-read grant, but permission
to publish API code can indirectly exercise the Lambda runtime's permissions.
Treat the release job as a trusted code-execution boundary. Do not claim it
is isolated from runtime data if its code is compromised.

## Validate locally

Use the root `.env.aws` for AWS account/Region metadata. No application env
file or database credential is needed. Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm --filter @ai-sales-operations/infra-delivery unit-tests
DEMO_GITHUB_OIDC_PROVIDER_MODE=create \
pnpm --filter @ai-sales-operations/infra-delivery exec cdk synth --strict --no-lookups --quiet
```

The installed CDK library is `2.276.0`, CLI `2.1148.1`. Its
`OidcProviderNative` API emits `AWS::IAM::OIDCProvider` without a custom Lambda.
The tests also cover importing an existing provider. Set mode to `reuse`
when IAM already has `token.actions.githubusercontent.com`; inspect it for
audience `sts.amazonaws.com` before reuse. The imported provider ARN is derived
from the same target account. Re-check immediately before application because
providers are shared across the account. The provider is retained on stack
deletion; remove it separately only after verifying no other roles use it.

## Separately authorized setup and acceptance

No command in this section has been executed for issue #35. The developer must
first review the local diff and synthesized template, and authorize IAM/change
set preparation. Verify the existing CDK bootstrap version and its deployment,
file publishing and CloudFormation execution roles with the human AWS profile.
The bootstrap bucket/roles are only for this human setup. Do not automatically
bootstrap or change the bootstrap execution policy. Review its effective access
and any permissions boundary before proceeding.

With that authorization, prepare a named change set from the reviewed assembly:

```sh
pnpm --filter @ai-sales-operations/infra-delivery exec cdk --app cdk.out deploy \
  SalesOperationsDemoDelivery --method prepare-change-set \
  --change-set-name issue-35-demo-oidc --require-approval never \
  --profile sales-operations-dev
aws cloudformation describe-change-set --stack-name SalesOperationsDemoDelivery \
  --change-set-name issue-35-demo-oidc --profile sales-operations-dev --region ap-southeast-2
```

Require only one role and, in create mode, one native OIDC provider, plus CDK's
standard metadata resource. There must
be no change to application resources, bootstrap permissions or other roles.
Review the change set before separately authorized execution. Afterwards read
back `get-role`, `list-role-policies`, `get-role-policy`,
`list-attached-role-policies` and `get-open-id-connect-provider`. Verify exact
trust, one-hour maximum session, inline permissions and no attached policies.
Set the role ARN as a public `demo` environment variable for #36.

After approval and merge, run **Actions → Check demo AWS identity → Run workflow**
on main using the [manual workflow](../../.github/workflows/demo-identity-check.yml).
It uses Environment `demo`, job-scoped `id-token: write` (no checkout permission),
the official credential action pinned to the verified v6.3.0 commit, and a
15-minute session, then runs only `aws sts get-caller-identity`. It publishes no
files and runs no migrations. It validates token `iss`, `aud`, exact `sub`,
repository/owner IDs, environment and `ref` in memory, printing only pass/fail.
Never print the JWT or full credential environment. Record actual run URL,
source revision, role readback and result here. Negative local trust tests
are not live STS acceptance evidence. No identity workflow is added to PR CI.

To revoke access, separately authorize removing the role's federated trust
and revoking existing role sessions; disabling a workflow alone does not revoke
issued credentials. Remove publication policies or the role if retiring it.
Keep the shared provider until its other consumers have been checked. Re-check
trust after repository transfers/renames or OIDC subject configuration changes.

## Primary documentation reviewed

- [GitHub AWS OIDC setup](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [GitHub immutable subjects and environment claims](https://docs.github.com/en/actions/reference/security/oidc)
- [AWS OIDC role trust](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html)
- [CDK bootstrap roles](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html)
- [CDK provider implementation guidance](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_iam.OpenIdConnectProvider.html)
- [Lambda authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_lambda.html)
- [S3 authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_s3.html)
- [CloudFront authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_cloudfront.html)

## Local validation record — 18 November 2026

- `pnpm lint`: passed after correcting regex-spacing lint errors in the new test.
- `pnpm typecheck`: passed across the workspace after rerunning with access to
  Prisma's existing cache; the first sandboxed run failed with `EPERM` on a
  cache timestamp update. A later delivery-only typecheck caught an inference
  error in the workflow test; adding an explicit child-process result type fixed it.
- `pnpm --filter @ai-sales-operations/infra-delivery unit-tests`: six passed,
  including negative subject/audience cases, complete policy assertions,
  provider create/reuse, CI separation and execution of the workflow claim script.
- `pnpm --filter @ai-sales-operations/infra-delivery typecheck`: passed after
  that final test fix.
- Strict synthesis using the command above: passed in `create` mode and in
  `reuse` mode with `--output cdk.out/reuse`. Reviewed the generated template:
  no application resource changes or bootstrap-role assumptions. CDK reported
  unconfigured feature flags; it emitted no strict synthesis errors.
- Ruby `YAML.load_file` parsed the manual workflow. `actionlint` is unavailable;
  no GitHub runner execution is claimed. The pinned action's declared inputs
  and Node 24 runtime were inspected through the GitHub contents API.
- `node scripts/check-docs.mjs` and `git diff --check`: passed.
- Initial `gh issue view 35` failed under network restrictions; the authorized
  network retry succeeded. An unquoted GitHub contents URL was rejected by
  zsh globbing; the quoted retry succeeded without any remote change.
- `pnpm install --offline --ignore-scripts` stopped because pnpm needed purge
  confirmation. The explicit-purge offline retry then lacked a cached tarball.
  `pnpm install --no-frozen-lockfile --ignore-scripts --config.confirmModulesPurge=false`
  with authorized dependency-store access succeeded; the lockfile adds only the
  new workspace importer using existing pinned dependencies.

Application build/database integration checks were not run for this infrastructure
change. No server or container was started. No AWS/GitHub settings were changed,
no change set was prepared, and no IAM, deployment or live OIDC acceptance was run.
