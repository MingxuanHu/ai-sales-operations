# Development and delivery workflow

## PR cycle

**Issue → short-lived branch → implementation and validation → developer review and confirmation → PR → CI + independent AI comments → developer decision → squash merge.**

A milestone spans several PRs. Keep PRs small and `main` buildable. No agent may merge its own changes or deploy without approval. Link real issue and PR evidence when available.

## Milestone kickoff and GitHub Issues

1. At kickoff, agree the milestone's scope and acceptance outcomes, create its specification from the [milestone template](../milestones/TEMPLATE.md), and link it from the [roadmap](../planning/roadmap.md).
2. Split the milestone into independently reviewable changes, each suitable for one scoped Issue/PR. About 2–5 PRs may be useful, but this is not a quota; each merge must leave `main` buildable.
3. Check existing GitHub Issues to avoid duplicates. Draft each Issue with a clear title, goal, in/out of scope, acceptance criteria, relevant documentation, dependencies and validation commands or manual checks. Present the specification and issue breakdown for developer confirmation.
4. After the developer confirms the breakdown, create the approved Issues in GitHub, assign them to the matching GitHub milestone, and record their links in the specification. Kickoff ends when the links are recorded. Confirmation of the breakdown authorizes this step.

## Issue implementation

1. Wait for a separate developer request to implement an Issue. Work on one ready Issue at a time. Start a short-lived branch from current `main` and explain the change and acceptance checks before coding.
2. After implementation and validation, present the local changes and check results for developer review. The coding agent may open the PR only after the developer has reviewed the changes and explicitly confirmed to proceed. Link the PR to the Issue with `Closes #<actual-issue-number>` and record the PR in the specification.
3. After PR review, passing required checks and merge, verify the acceptance evidence. Close the milestone when its agreed outcomes are met.

## Validation checks and rollout

GitHub Actions runs `docs-check` (`node scripts/check-docs.mjs`) and the five application jobs below on PRs targeting `main` and pushes to `main`. Each application job installs the pinned workspace tools and runs the corresponding package script. The integration test uses Docker Compose to start and remove its own temporary PostgreSQL service on the runner.

| Check | Purpose |
| --- | --- |
| `lint` | Enforce agreed code quality rules. |
| `typecheck` | Check TypeScript types across the web/API workspace. |
| `unit-tests` | Verify isolated functions, services and components. |
| `integration-tests` | Verify API/module and database interactions using temporary PostgreSQL; include authentication and tenant isolation as those features arrive. |
| `build` | Compile/package the web and API for their target runtimes. |

Run `pnpm check` with Docker running to execute all five application checks locally. It stops at the first failure. GitHub Actions runs the jobs independently so each result is visible on the PR. CI tests use synthetic data and mocked external identity/AI boundaries as those features arrive, without demo credentials.

Use `docs-check` as the initial required status check. Add application checks to branch protection after their jobs exist and have run successfully; do not require nonexistent checks. M4 completes the protected delivery and AI review pipeline. Report actual commands and results in every PR, including failures and checks not run with reasons.

## Environments and releases

| Event | Action |
| --- | --- |
| Feature branch or PR | Lint, typecheck, unit/integration tests, build; AI reviewer comments |
| Merge to `main` (from M4) | Build and deploy to GitHub Environment `demo` via AWS OIDC; smoke test |
| Release tag | Optional manually verified portfolio snapshot |

The AI reviewer is **advisory**; deterministic CI checks are required. For a single-developer public repo, do not require another person's formal PR approval. Protect `main` against direct pushes, deletion and force pushes; resolve review conversations before merging where supported.

## Portfolio evidence

After real PRs exist, link a few showing agent implementation, independent review comments, fixes, test results and developer judgement. Do not claim AI feedback was correct without verification.
