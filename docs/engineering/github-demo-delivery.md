# GitHub protection and demo environment

## Effective configuration

Issue [#34](https://github.com/MingxuanHu/ai-sales-operations/issues/34)
configures the existing public repository, without creating AWS resources.
Verified on 18 November 2026 using the GitHub REST API:

- `main` requires a PR and resolved review conversations. The required approval
  count is zero for this single-developer repository; developer review remains
  part of the delivery workflow.
- Required checks are `docs-check`, `lint`, `typecheck`, `unit-tests`,
  `integration-tests` and `build`. Each is bound to GitHub Actions app ID
  `15368`. Strict checks require the PR branch to be up to date with `main`.
- Administrator enforcement and linear history are enabled. Force pushes and
  deletion are disabled. No repository rulesets were present at inspection.
- Environment `demo` uses selected deployment branches, with exactly one
  policy: name `main`, type `branch`. There are no tag policies. It has no
  required reviewer or wait timer, matching the planned automatic release.

This public personal repository supports classic branch protection and
restricted environments without a plan upgrade. See GitHub's
[protected branch availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
and [environment availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
The account's paid subscription was not queried; public repository support is
sufficient for these settings.

**Administrator limits:** `enforce_admins.enabled` is `true` for the branch;
there is no configured administrator exemption from its normal merge rules.
Administrators can still edit protection settings. Environment readback reports
`can_admins_bypass: true`; there are currently no reviewer/timer gates to bypass.
These settings are not an absolute security boundary against repository admins.
OIDC trust and trusted release workflow checks remain separate work in #35–#36.

## Configuration contract for subsequent issues

The environment now contains **10 public variables** and the environment secret
`AWS_ACCOUNT_ID`, configured on 18 November 2026. The account ID was initially
configured as a variable, then moved to a secret at the developer's request.
The secret was written through stdin and its metadata verified before deleting
the variable; a subsequent variable listing confirmed its removal. GitHub does
not return secret values, so this verifies storage metadata rather than a
secret-value readback. The original 11 variables had passed value readback.

Future deployment workflows must read `${{ secrets.AWS_ACCOUNT_ID }}` and map it
to the deployment process's `AWS_ACCOUNT_ID` environment variable. There is no
existing release workflow consumer to update. This reduces casual visibility
and allows GitHub to mask the value when that secret is used in a job; it does
not replace AWS authorization. AWS does not classify account IDs as secrets.
See [AWS account identifiers](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-identifiers.html)
and [GitHub secret masking](https://docs.github.com/en/actions/concepts/security/secrets).
These settings prepare inputs for #35–#36; release automation is not implemented
yet. Never copy a local env file into GitHub or deployment artifacts.

The requested `local.env` and `.env.database` files were absent. The root `.env`
contains development Cognito settings and localhost database/redirect URLs, so
it was not used for demo values. Four settings came from `.env.aws`:
`AWS_REGION`, `AWS_ACCOUNT_ID`, `DEMO_WEB_ORIGIN` and
`DEMO_DATABASE_URL_PARAMETER`. The six `VITE_COGNITO_*` variables listed below
and `COGNITO_USER_POOL_ID` came from the existing `SalesOperationsDemoCognito`
stack outputs and URLs derived from the demo web origin. AWS STS confirmed the
profile's account matched `.env.aws` before reading the stack. No database or
SSM secret value was retrieved.

The setup used Node's `parseEnv` to read `.env.aws`, AWS CLI
`sts get-caller-identity` and `cloudformation describe-stacks` with the configured
profile and region, then `gh api` POST/PATCH requests to the environment
`variables` endpoint. Values were passed through stdin as JSON, without printing
them. A GET of that endpoint with `?per_page=100` verified all 11 values against
their sources. The first verification failed because the default list page
omitted variables; the larger-page retry passed. Existing variables were updated
by name and unrelated settings were preserved.

The deployment role ARN awaits #35. `DEMO_DIRECT_URL` still requires the separate
Neon credential-transfer procedure; the local Docker credential is unsuitable.
Shared issuer/client/audience values are stored once under their public `VITE_`
names and can be mapped to the API contract by the future release workflow.

| Target | Names and handling |
| --- | --- |
| Public web build | `VITE_COGNITO_DOMAIN`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_ISSUER`, `VITE_COGNITO_REDIRECT_URI`, `VITE_COGNITO_SIGN_OUT_URL`, `VITE_COGNITO_API_RESOURCE_URL`. Public GitHub environment variables can supply these to Vite; the resulting assets expose them. |
| AWS deployment metadata | Public variables `AWS_REGION`, `DEMO_WEB_ORIGIN`, `DEMO_DATABASE_URL_PARAMETER`; the latter is an SSM parameter name, not its secret value. Store `AWS_ACCOUNT_ID` as a `demo` environment secret and consume it through `secrets.AWS_ACCOUNT_ID`. The deployment role ARN input is to be finalized in #35. No stored AWS access keys. |
| API configuration | `COGNITO_USER_POOL_ID`, `COGNITO_ISSUER`, `COGNITO_APP_CLIENT_ID`, `COGNITO_API_RESOURCE_URL` belong to Lambda runtime configuration. Reuse the corresponding public web settings when assembling the runtime configuration instead of maintaining duplicate shared values. |
| API runtime database | `DATABASE_URL` stays in SSM SecureString and is retrieved through the existing API mechanism. Never provide it to web builds or PR jobs. |
| Migration secret | GitHub Environment `demo` secret `DEMO_DIRECT_URL`, mapped to `DIRECT_URL` only in the migration step. Transfer remains pending under the milestone's separate credential procedure. |

Keep the root `.env` as the sole local application environment file and
`.env.aws` for infrastructure metadata. See the
[hosting decision](../decisions/0003-hosting.md#application-configuration),
[security guidance](security.md), and existing
[API](../../infra/api/README.md) and [web](../../infra/web/README.md) runbooks.
AI reviewer configuration is outside this issue.

## Evidence and repeatable readback

Before changing protection, all six named checks succeeded on
[PR #38's CI run](https://github.com/MingxuanHu/ai-sales-operations/actions/runs/44229646470)
and [current main's CI run](https://github.com/MingxuanHu/ai-sales-operations/actions/runs/44229771620).
The inspected `main` revision was `478f1cc173ec7029159658f5cbe78ae07eea1a21`.
These runs establish actual check names, not a controlled blocking test of the
new configuration.

Commands executed successfully (paths below are relative to the GitHub API):

```sh
gh issue view 34 --json number,title,body,milestone,state,url,labels
gh api repos/MingxuanHu/ai-sales-operations/rulesets
gh api repos/MingxuanHu/ai-sales-operations/commits/main/check-runs
gh pr view 38 --json url,headRefOid,statusCheckRollup
# PATCH updates only check requirements, preserving the other protection settings.
gh api --method PATCH repos/MingxuanHu/ai-sales-operations/branches/main/protection/required_status_checks --input /tmp/issue34-checks.json
# The JSON sets protected_branches=false and custom_branch_policies=true.
gh api --method PUT repos/MingxuanHu/ai-sales-operations/environments/demo --input /tmp/issue34-environment.json
gh api --method POST repos/MingxuanHu/ai-sales-operations/environments/demo/deployment-branch-policies -f name=main -f type=branch
# Read back effective settings rather than relying on successful writes alone.
gh api repos/MingxuanHu/ai-sales-operations/branches/main/protection
gh api repos/MingxuanHu/ai-sales-operations/environments/demo
gh api repos/MingxuanHu/ai-sales-operations/environments/demo/deployment-branch-policies
gh api 'repos/MingxuanHu/ai-sales-operations/environments/demo/variables?per_page=100' --jq '{total_count,names:[.variables[].name]}'
gh api repos/MingxuanHu/ai-sales-operations/environments/demo/secrets --jq '{total_count,names:[.secrets[].name]}'
```

The checks request was `strict: true`, with a `checks` array containing the
six names above as `context`, each with `app_id: 15368`.
The temporary request files contain only non-secret configuration.

**Pending acceptance:** after developer review authorizes this issue's PR,
observe the PR while a required check is missing or pending and record GitHub's
blocked merge state. If a check fails naturally, record that state too;
otherwise arrange a developer-reviewed temporary failure on the issue branch,
record the blocked state, then restore the valid content and require all six
checks to pass. Never attempt a merge, direct push to `main`, force push or
branch deletion to test protection. Link the actual evidence here before
closing #34. Do not create a test PR before the required developer review.

Local validation for this documentation-only change is
`node scripts/check-docs.mjs`, relative-link verification and `git diff --check`.
Application tests were not rerun because application code and CI are unchanged;
prior CI evidence above is explicitly historical. No servers or containers were
started. Initial sandboxed GitHub access failed to connect, and branch creation
initially failed because `.git` writes required escalation; both succeeded on
retry with the necessary access. An exploratory search of nonexistent
`infra/api/bin` and `infra/web/bin` failed; source files were located at each
infrastructure package root instead.
