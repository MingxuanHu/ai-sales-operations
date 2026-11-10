# Development and delivery workflow

## PR cycle

**Issue → short-lived branch → coding agent + developer review → PR → CI + independent AI comments → developer decision → squash merge.**

A milestone spans several PRs. Keep PRs small and `main` buildable. No agent may merge its own changes or deploy without approval. Link real issue and PR evidence when available.

## Environments and releases

| Event | Action |
| --- | --- |
| Feature branch or PR | Lint, typecheck, unit/integration tests, build; AI reviewer comments |
| Merge to `main` (from M4) | Build and deploy to GitHub Environment `demo` via AWS OIDC; smoke test |
| Release tag | Optional manually verified portfolio snapshot |

The AI reviewer is **advisory**; deterministic CI checks are required. For a single-developer public repo, do not require another person's formal PR approval. Protect `main` against direct pushes, deletion and force pushes; resolve review conversations before merging where supported.

## Portfolio evidence

After real PRs exist, link a few showing agent implementation, independent review comments, fixes, test results and developer judgement. Do not claim AI feedback was correct without verification.
