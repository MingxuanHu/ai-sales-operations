# M04 - 01 — CI/CD & AI review

**Goal:** A developer-reviewed PR receives deterministic checks and independent AI comments, then its trusted merge to protected `main` automatically releases and smoke-tests the public demo.

## Scope and acceptance

- **In scope.** Protect `main`, configure GitHub Environment `demo`, replace personal release credentials with scoped AWS OIDC access, automate the existing demo release, and add an advisory independent AI reviewer.
- **Out of scope.** Sales features, custom domains, destructive migrations, automatic merging, and AI approval authority. Preserve M3's agreed live invitation-test deferral until invitation management UI exists.
- **Environments.** Keep exactly the existing local development environment and online demo. GitHub Environment `demo` groups release settings, secrets and branch restrictions for that same online demo; it does not provision another application environment.
- **Acceptance evidence.** Link actual Issues, PR checks, reviewed protection and OIDC configuration, an AI review with developer disposition, and a successful merge-triggered deployment tied to its source revision. Record smoke results and a rollback exercise using synthetic data. Do not record credentials, tokens or identity details.
- **Security boundary.** PR checks and AI review receive no deployment credentials or database secrets. Deployment is limited to trusted `main` and the `demo` environment. IAM changes and deployment execution require separate developer authorization. The AI reviewer is advisory; deterministic CI and the developer's decision remain authoritative.
- **Configuration boundary.** Follow the [hosting decision](../decisions/0003-hosting.md#application-configuration): public `VITE_*` build settings, backend runtime settings, and a deployment-only direct migration credential. Never upload local env files or expose the migration credential to Lambda or PR jobs.

## Issues / PRs

**Kickoff complete.** The approved breakdown is tracked in the [M4 — CI/CD & AI review GitHub milestone](https://github.com/MingxuanHu/ai-sales-operations/milestone/4). [PR #33](https://github.com/MingxuanHu/ai-sales-operations/pull/33) contains the reviewed specification. Issues below are created; implementation requires a separate request under the [delivery workflow](../engineering/delivery.md#issue-implementation).

### 1. Protect main and establish the demo release environment

[Issue #34](https://github.com/MingxuanHu/ai-sales-operations/issues/34) · [PR #39](https://github.com/MingxuanHu/ai-sales-operations/pull/39)

**Implementation status (18 November 2026):** all six checks are required and
Environment `demo` allows only branch `main`; effective settings were read back.
See the [configuration and evidence record](../engineering/github-demo-delivery.md).
The developer reviewed the changes and authorized creation and merge of
[PR #39](https://github.com/MingxuanHu/ai-sales-operations/pull/39). GitHub
reported the PR blocked while required checks were pending; all six checks
then passed. The evidence update must also pass CI before squash merge.
Issue closure follows the authorized merge.

- **Goal.** Make passing deterministic checks and a reviewed PR the normal route into `main`.
- **In scope.** Inspect current repository settings and successful check names; configure required `docs-check`, `lint`, `typecheck`, `unit-tests`, `integration-tests` and `build` checks. Require PRs and resolved review conversations where supported; block direct pushes, force pushes and deletion. Do not require another person's approval in this single-developer repository. Create/configure `demo` with deployment restricted to `main`, and document public variables and secret names without their values. Check repository-plan support before choosing protection settings and document any limitation.
- **Out of scope.** AWS IAM, release execution and AI integration.
- **Acceptance.** Read back the effective rules and environment restrictions. Show a PR receiving all six checks and verify missing/failing checks prevent normal merging. Record any administrator bypass separately; do not claim absolute protection if bypass remains possible.
- **Dependencies.** Existing CI; developer authorization for repository configuration changes.
- **Validation.** `node scripts/check-docs.mjs`; inspect actual Actions check names and repository/environment API readback. Record the controlled protection check without force-pushing or deleting branches.

### 2. Define least-privilege AWS OIDC deployment access

[Issue #35](https://github.com/MingxuanHu/ai-sales-operations/issues/35)
· [PR #41](https://github.com/MingxuanHu/ai-sales-operations/pull/41)

**Local implementation (18 November 2026):** the [delivery CDK package](../../infra/delivery/README.md)
defines exact immutable GitHub repository/demo trust, optional native provider
creation or reuse, and permissions limited to existing application artifact
publication targets. Review the proposed direct artifact release approach for
#36: automated CDK infrastructure deployment is deliberately not granted.
The developer subsequently authorized AWS deployment. The reviewed change set
created the provider and scoped role, and CloudFormation reached
`CREATE_COMPLETE`; IAM readback matches the intended trust and policy. See the
[deployment evidence](../../infra/delivery/README.md#authorized-aws-deployment-record--18-november-2026).
The trusted GitHub identity check remains pending workflow review/merge and
configuration; full issue acceptance is not yet claimed.

- **Goal.** Allow the trusted demo release job to use temporary AWS credentials without stored AWS access keys.
- **In scope.** Add reviewable TypeScript CDK definitions and tests for the deployment role and any required OIDC provider setup, reusing an existing provider where appropriate. Bind trust to the actual repository and `demo` environment, with the expected audience. Scope deployment permissions to the existing demo resources and required CDK publishing/execution paths; explain any actions that cannot use resource-level restrictions. Separate migration-secret access from runtime access and document bootstrap prerequisites and revocation.
- **Out of scope.** Broad administrator access, replacing demo resources, and automatic application deployment.
- **Acceptance.** Tests reject unrelated repository/environment trust and validate scoped policies. Review synthesis and change sets before separately authorized IAM changes. A trusted `main` job in `demo` can obtain the intended role; PR jobs have no OIDC credential step or deployment environment. Inspect token claims and trust evaluation without printing tokens.
- **Dependencies.** Issue #34; separately authorized AWS/IAM changes. Review current AWS/GitHub primary documentation and installed CDK APIs during implementation.
- **Validation.** `pnpm lint`, `pnpm typecheck`, relevant infrastructure unit tests and strict CDK synthesis. After authorization, record IAM readback and a minimal identity check from the trusted job without releasing application changes.

### 3. Automate the demo release and add manual version rollback

[Issue #36](https://github.com/MingxuanHu/ai-sales-operations/issues/36)

- **Goal.** Release the tested `main` revision through the existing M3 infrastructure and verify the public result.
- **In scope.** Add a release workflow that waits for all required checks on the same revision, uses Environment `demo` and OIDC, and serializes releases to prevent overlapping migrations/publications. Package and verify Lambda, build React with public demo settings, run committed Prisma migrations with the direct credential confined to that step, release API before web assets, publish hashed assets before the entrypoint, and wait for CloudFront invalidation. Preserve the existing CDK stack/resource identities. Record revision, artifact checksums, prior artifacts and migration outcome for diagnosis and rollback. Document partial-failure recovery and forward-compatible schema changes; a code rollback must not imply reversing a migration.
- **Migration credential.** The developer authorized using the Neon CLI to retrieve the existing demo owner's direct connection URL and store it in GitHub. Follow the [Neon runbook](../engineering/neon-demo.md#3-apply-the-repository-migrations) and record execution evidence below. Store it once as the `DEMO_DIRECT_URL` secret in GitHub Environment `demo`. Map it to `DIRECT_URL` only for the migration step; never put it in repository files, artifacts, logs, web builds or Lambda settings. AWS OIDC supplies AWS credentials, not a Neon database password. No Neon API key or interactive Neon login is needed on the runner. Update this secret when the database password rotates.
- **Manual rollback UI.** Add a `Rollback demo` workflow on trusted `main` using `workflow_dispatch`, available through **Actions → Rollback demo → Run workflow**. The developer enters a previously successful deployment's release ID (source SHA plus run ID) and confirms the target. Publish a release catalog in workflow summaries with IDs, revisions, deployment results and artifact expiry. Native Actions choice options are declared in YAML, so use a validated release-ID text field rather than promise a dynamically populated version dropdown. See [manual runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) and [input syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
- **Rollback behavior.** Retain immutable web/API bundles and checksum manifests for successful releases, initially targeting 90 days within repository policy and storage limits. Validate that the selected ID belongs to a successful demo release from this repository's trusted `main`, verify checksums, and reject missing, expired or incompatible releases before changing the demo. Use current trusted rollback code and the stored artifacts rather than executing workflow/scripts from the selected old revision or rebuilding it. Serialize rollback with normal deployment, use the same `demo` environment and OIDC restrictions, restore application artifacts, invalidate CloudFront and run smoke checks. Do not run old migrations or automatically restore infrastructure/database state; explicitly check compatibility with the current schema and infrastructure. Record the initiator, previous release, selected release and result. [Artifact retention](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts) limits which versions remain available.
- **Out of scope.** Automatic destructive schema rollback, database restoration and new product behavior.
- **Acceptance.** A developer-authorized merge-triggered release deploys exactly the checked revision. Failed checks prevent deployment; migration failure prevents subsequent rollout; a release failure is visible. Verify public HTTPS, SPA routes including `/auth/callback` and `/onboarding`, `/api/health`, unauthenticated `/api/me` rejection, private S3 access and published asset checksums. Use the Actions manual-run UI to select a retained successful release by ID, verify rejection of invalid/expired IDs, roll back to its exact artifacts, then restore the intended release without destructive migrations. Record synthetic authenticated smoke evidence without placing tokens in logs.
- **Dependencies.** Issues #34–#35 and explicit authorization for the first deployment/rollback exercise. Reuse the [API](../../infra/api/README.md) and [web](../../infra/web/README.md) runbooks. Confirm current GitHub Actions and AWS behavior from primary documentation during implementation.
- **Validation.** `pnpm check`, `pnpm --filter @ai-sales-operations/api run package:lambda`, `NODE_OPTIONS=--experimental-require-module node --test scripts/test-api-artifact.mjs`, relevant strict CDK syntheses, workflow validation and release-script failure-path tests. Record actual live smoke and rollback commands/results after authorization.

### 4. Add independent advisory AI PR review

[Issue #37](https://github.com/MingxuanHu/ai-sales-operations/issues/37)

- **Goal.** Give the developer useful independent findings on PR diffs without granting merge or deployment authority.
- **In scope.** Compare available reviewer integrations, permissions, untrusted-diff handling, fork behavior and cost before selecting one with the developer. Add narrowly scoped review configuration and document operation, usage limits and failure handling. Treat repository text and diffs as untrusted input; avoid privileged execution of PR code, deployment secrets and `pull_request_target` execution on untrusted changes. Define a safe fork policy if the chosen integration needs credentials. Keep deterministic checks required when review is unavailable.
- **Out of scope.** Autonomous fixes/merges, required AI approval and exposing customer data or deployment credentials to the reviewer.
- **Acceptance.** Record real comments on a representative PR and the developer's disposition, including any incorrect suggestions. Verify review is independent of the implementing agent, has only necessary permissions, cannot deploy, and handles unavailable credentials/provider failures visibly without blocking deterministic CI. Document the chosen service's cost and any developer-approved spending limit.
- **Dependencies.** Issue #34; developer selection and authorization for any third-party installation, credential or paid service. This can proceed independently of proposals 2–3.
- **Validation.** `node scripts/check-docs.mjs`, workflow/configuration validation, permission review, and a controlled PR review run. No invented review evidence or provider results.

## Kickoff validation

This kickoff changes documentation only. Run `node scripts/check-docs.mjs` and `git diff --check`, and verify the new relative documentation links resolve. No application checks, servers, containers, IAM resources or deployments were needed. GitHub milestone 4 and Issues #34–#37 were created after developer approval; issue and milestone membership were verified through the GitHub API.

## Migration credential setup record

**Authorization and current status.** The developer approved retrieving the direct migration credential with the Neon CLI and saving it in GitHub. The developer reports prior Neon CLI use during M3. Current executable checks found neither `neon` nor `neonctl` on `PATH`; that check does not establish whether a prior invocation used a package runner or another executable location. The shared prior-chat link could not be fetched during follow-up. Recover or re-establish the CLI invocation and check existing authentication before deciding installation or login is needed. No connection URL was retrieved and no GitHub secret was created or changed during this kickoff. Secret transfer remains pending; this is a procedure, not completed setup evidence.

**Planned procedure.**

1. Recover the prior Neon CLI invocation or use the official CLI through a package runner; install it only if needed. Check existing authentication before using `neon login`, and confirm the existing demo project, branch, database and migration owner with the developer's account. Keep the local Docker `.env` unchanged.
2. Confirm GitHub repository `MingxuanHu/ai-sales-operations` and Environment `demo` are configured for trusted `main`. Retrieve the direct URL using `neon connection-string BRANCH_ID --project-id PROJECT_ID --database-name DATABASE --role-name OWNER_ROLE` with pooling disabled. Capture stdout in memory with shell tracing disabled; validate the expected host, database and role without printing the URL.
3. Pipe the captured value through stdin to `gh secret set DEMO_DIRECT_URL --env demo --repo MingxuanHu/ai-sales-operations`. Do not place the URL in command arguments, temporary files, logs or documentation. Clear the in-memory value after transfer, including on failure. Do not save a Neon API key in GitHub.
4. Verify the secret's name and update metadata using `gh secret list --env demo --repo MingxuanHu/ai-sales-operations`; GitHub does not return the stored value. Record the actual commands with placeholder identifiers, the confirmed non-secret target identifiers, success/failure and secret metadata here. This metadata proves storage, not database connectivity.
5. During the authorized deployment validation, map the secret to `DIRECT_URL` only in the migration step and record migration/status results. Do not claim that storage alone verifies the credential or run migrations as part of this setup.

After execution, replace the pending status with actual evidence and any failures. Never copy the credential, its password or a credential-bearing error into this record.
