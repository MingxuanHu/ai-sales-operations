# Automated demo releases and rollback — issue #36

## Release boundary

`Release demo` starts after `CI` completes on a push to `main`. Its gate reads
that run and all six named jobs from GitHub, requires success on the exact
revision, and rejects foreign repositories, PR runs and superseded revisions.
The workflow's initial checkout must match that revision too. It checks out
that SHA explicitly before building. No PR artifacts are consumed.

Both workflows use Environment `demo`, its main-only branch restriction, the
existing scoped OIDC role, and concurrency group `demo-publication` with no
in-progress cancellation. GitHub may replace a pending run with another pending
run; it does not interrupt an active publication. The gate rejects an older
release whose CI finishes after newer main. This automates application artifacts
only; CDK resource identities and runtime configuration remain unchanged.

**Before merging the workflow for the first time:** obtain developer authorization
for the first live release and rollback exercise. A successful main CI run after
merge will initiate a real release, including migrations. Local implementation
validation does not authorize that execution.

The existing [environment contract](github-demo-delivery.md#configuration-contract-for-subsequent-issues)
supplies the public web settings, Region, role ARN and account secret. Only the
migration step receives `DEMO_DIRECT_URL`, mapped to `DIRECT_URL`. The runtime
URL remains in SSM. No env file is copied or built into the bundles.

## Publication and evidence

1. Build and exercise the isolated Lambda package. ZIP it and enforce the
   50 MiB direct-upload ceiling. Build React with the six public demo settings.
2. Obtain OIDC credentials. Create a manifest with source SHA, release ID
   (`SHA-runID`), SHA-256 inventory, existing resource identifiers, and schema,
   infrastructure-source and Lambda runtime fingerprints. Runtime values are
   hashed in memory, never saved in the manifest.
3. Upload the immutable `demo-SHA-runID` Actions artifact with a requested
   90-day retention. Repository policy/storage limits may shorten availability.
   Artifacts from failed runs are diagnostic only and cannot be selected.
4. Run committed Prisma migrations, check their status, and apply the explicit
   demo runtime grants in `scripts/demo-runtime-grants.sql` using the direct
   credential only in this step. Update that list when adding application tables
   that Lambda needs to query. Capture raw CLI output privately because errors
   can contain connection details; retain only a fixed pass/fail result. Any
   failure stops rollout. Investigate through the protected Neon runbook.
5. Validate local checksums and compatibility. Record the previous manifest
   from S3 and previous Lambda code hash. Update Lambda using its revision ID
   to reject concurrent changes; wait for completion and verify its code hash.
   Check health and unauthenticated `/api/me` before publishing web assets.
6. Upload assets first, then `index.html`, keeping older files. Wait for the
   CloudFront invalidation. Check exact HTML at `/`, `/auth/callback` and
   `/onboarding`, health JSON, unauthenticated `401`, unsigned S3 `403`, and
   every published web checksum. Fetches use timeouts.
7. Write `_release/current.json` only after smoke succeeds. Save diagnostic
   stages, previous/selected release, actor and triggering actor in a separate
   `demo-record-runID-attempt` artifact. Workflow summaries report migration,
   publication result and the retained successful-release catalog with expiry.
   The current run becomes selectable only after GitHub marks it successful.

The pre-M4 manual demo has no retained Actions bundle. Its initial release
record may therefore have only the previous Lambda hash rather than an older
release ID. Do not claim artifact rollback to the M3 deployment. Establish at
least two successful automated releases before the rollback acceptance exercise.
Artifacts contain public settings and application code only; never upload raw
migration output, credentials, tokens, local env files or customer data.

## Actions rollback UI

**Availability:** these controls appear only after the workflows are merged
into `main`. Before the first rollback, there must be a successful automated
release to return to. The manual M3 deployment is not selectable.

1. Open the [repository Actions page](https://github.com/MingxuanHu/ai-sales-operations/actions).
   Select **Release demo**, then open a successful run. In its **Summary**, find
   the release catalog. Choose a retained successful release with an expiry
   date still in the future. Copy its entire release ID: a 40-character source
   SHA, a hyphen, then the numeric Actions run ID. Do not copy the artifact's
   `demo-` prefix, a short commit hash or just the run number.
2. Save the **currently intended newer release ID** too. You will use this ID
   if you want to return to the newer version after testing the rollback.
   The older release must satisfy the compatibility rules below; an unexpired
   artifact alone does not guarantee it is compatible.
3. In the Actions sidebar select **Rollback demo**, then **Run workflow**.
   Select branch **main**. Paste the chosen older ID into both **release_id**
   and **confirm_release**, then click **Run workflow**. These are validated
   text inputs, not a version dropdown. This click authorizes a real demo
   publication; rollback does not have a preview mode.
4. Open the newly created run. It may wait while another demo publication is
   active. Wait for the complete run to turn green, including **Restore exact
   API and web artifacts and smoke test**. Do not treat successful input
   validation or OIDC exchange alone as a successful rollback.
5. Open the [demo](https://d3finwpuxpr8bj.cloudfront.net), refresh the page, and
   check the intended behavior. Automated smoke checks verify HTML and asset
   hashes, routes, API health, unauthenticated rejection and private S3 access.
   Sign in with a synthetic demo identity to verify authenticated behavior too;
   this manual check is not part of the workflow.
6. To restore the newer release, repeat steps 3–5 using the newer release ID
   saved in step 2 in **both** inputs. This republishes that exact retained
   bundle; it does not rebuild it or reverse database changes.

**If rollback fails:** open the first failed step. Validation failures for a
missing, expired, mistyped or incompatible release occur before publication;
choose another eligible ID or prepare a reviewed forward fix. If publication
has started, some API or web files may already have changed. Read the
`demo-record-runID-attempt` artifact in the run's **Artifacts** section for the
last recorded stage and previous/selected release, then use the recovery table
below. A failure before publication may have no diagnostic artifact. Never
assume a red run automatically restored the previous version.

The current trusted main scripts verify the source workflow, repository, main
branch, event, successful run result, ID and artifact expiry before downloading.
They reject missing/expired artifacts, inventory changes and checksum mismatches.
The selected bundle is data; its scripts and migrations are never executed.
After OIDC exchange, runtime compatibility is checked before the first mutation.
Rollback uses the same API-first publication, invalidation and smoke sequence.
Run it again with the intended newer release ID to restore that release.

Compatibility is intentionally conservative: the selected release must have
identical committed Prisma and API/web/Cognito infrastructure files and the
same current Lambda runtime fingerprint. Even a documentation change inside
those infrastructure directories can make an older bundle ineligible. A code
rollback never reverses migrations or infrastructure. The fingerprints compare
reviewed definitions and live Lambda configuration; they do not detect arbitrary
out-of-band CloudFront/S3 drift. Infrastructure changes stay separately reviewed
and require a new successful release baseline. Keep the deployed resources
aligned with CDK; subsequent CDK deployments must use the desired current code
rather than an old synthesized assembly.

## Failure recovery and schema changes

| Failure boundary | Result and recovery |
| --- | --- |
| Gate/build/manifest/retention | No migration or publication. Fix the cause before a new reviewed main revision. |
| Migration, status or runtime grants | No application publication. Inspect Prisma state and table permissions through authorized owner access. Do not blindly resolve or reverse a migration. |
| Lambda update/wait/hash/API smoke | Web publication has not begun; API may already have changed. Inspect the stage record; restore an eligible retained release or publish a forward fix after review. |
| Asset upload/HTML/invalidation/web smoke | API and some web files may have changed. No success marker is written. Old assets remain. Restore an eligible exact bundle, invalidate and repeat smoke, or release a forward fix. |
| Success marker/catalog/record upload | Publication may have passed but the workflow can fail. Inspect smoke and record evidence before deciding recovery; a failed run is not a rollback candidate. |

Do not cancel an active release. A forcibly canceled runner cannot guarantee
record upload or undo partial publication. Inspect the last completed step and
live state. Do not use `s3 sync --delete`. Retention expiry is irreversible from
this UI; use a separately reviewed forward release if no compatible bundle
remains. Artifacts are immutable: re-running the same release run can collide
with its existing artifact name and stops safely. Use a fresh reviewed main
revision for a corrected release rather than overwriting an earlier bundle.

Use expand/contract migrations: add compatible structures first, deploy code
that can tolerate both schemas, migrate data under separate authorization, and
remove old structures only after their consumers and rollback needs end. This
initial implementation refuses cross-migration rollback even for additive
changes. Review any relaxation separately. It never runs old migrations,
restores a database, changes IAM or deploys infrastructure.

## Local validation — 18 November 2026

Commands actually run for this implementation:

- `pnpm check`: lint, typecheck and unit tests passed; integration failed because
  the sandbox denied Docker socket access, so its build stage was not reached.
  Final `pnpm check` with Docker access passed all five checks, including the
  final nine release tests and the database integration suite.
- `pnpm integration-tests && pnpm build` with Docker access: passed, including
  tenant isolation. Existing Vite chunk-size warning remains.
- `node --test scripts/test-demo-release.mjs`: nine tests passed, covering CI
  provenance/results, missing/skipped checks, expired/foreign/failed rollback
  candidates, tampering, compatibility, publication ordering, failure boundaries,
  API/web smoke failures, migration-log secrecy and workflow secret placement.
- `pnpm --filter @ai-sales-operations/api run package:lambda`: sandboxed attempt
  failed on npm DNS/network access; retry with network access passed.
- `NODE_OPTIONS=--experimental-require-module node --test scripts/test-api-artifact.mjs`:
  passed against the isolated built package. The workflow-equivalent ZIP command
  produced 35,306,306 bytes, below the 50 MiB direct-upload ceiling.
- Strict no-lookup syntheses for infra API, web and delivery passed. API synthesis
  used synthetic Cognito identifiers; web used the recorded demo API origin;
  delivery used provider mode `reuse`. These were local checks, not deployments.
  CDK reported its existing unconfigured-feature-flags notice.
- `actionlint` v1.7.12: passed all workflows.
- `node scripts/check-docs.mjs` and `git diff --check`: passed.

The integration suite removed its temporary PostgreSQL container and server.
The pre-existing development PostgreSQL and `timescaledb-backup` containers were
left running. No persistent test servers were started.

**Live acceptance verified — 18 November 2026.** PR #44's first attempt exposed
the waiter permission mismatch; merged PR #45 corrected it without changing IAM.
Two checked releases subsequently passed publication and public smoke. Actual
Actions UI rollback to the older retained bundle and restoration of the newer
bundle both passed, with independent Lambda/web hash checks and a synthetic
signed-in workspace check after restoration. See the
[full acceptance record](../milestones/M04-01-cicd-ai-review.md#issue-36--final-live-acceptance-18-november-2026)
for all run links, copyable release IDs, actual expiry times and test limitations.

The two retained releases use the same reviewed source SHA but have distinct
API ZIP hashes. The exercise proves exact-artifact recovery, rather than a
change in product behavior across code versions. Invalid input was rejected
through the real UI. Expiry rejection used actual artifact metadata with a
simulated post-expiry clock; no naturally expired artifact was available for a
live UI test. No destructive schema changes or IAM expansion were needed.
The final demo points to release
`7b7a22c295064292c8fabdf4ea4548ad082eb03a-44243929502`. For a future rollback,
choose a currently retained, compatible ID from the catalog rather than assuming
these dated examples remain available forever.

## Verified primary references

Checked during implementation:
[GitHub workflow-run events and privileged-workflow warning](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run),
[workflow jobs API](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run),
[manual dispatch inputs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatchinputs),
[artifact availability and retention](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts),
[configuration-based Lambda waiter](https://docs.aws.amazon.com/cli/latest/reference/lambda/wait/function-updated.html),
[GetFunction-based v2 waiter](https://docs.aws.amazon.com/cli/latest/reference/lambda/wait/function-updated-v2.html),
[Lambda revision-guarded code updates](https://docs.aws.amazon.com/cli/latest/reference/lambda/update-function-code.html),
[CloudFront invalidation waiter](https://docs.aws.amazon.com/cli/latest/reference/cloudfront/wait/invalidation-completed.html).
