# ADR 0002 — Trunk-based delivery

**Status:** Accepted.

- Protected `main` is the only long-lived code branch.
- Short-lived Issue branches (`feature/*`, `fix/*`, `chore/*`, `docs/*`). Multiple PRs per milestone.
- Each PR: deterministic CI, independent AI review comments, developer review; squash merge.
- From M4, trusted merges into `main` automatically deploy to GitHub Environment `demo`.
- No persistent `develop`, release or deployment branch. Optional version tags mark portfolio snapshots.

**Why:** Demonstrates a real delivery pipeline without maintaining multiple low-traffic cloud environments. The demo is not a regulated production release; a manual approval gate can be added later.
