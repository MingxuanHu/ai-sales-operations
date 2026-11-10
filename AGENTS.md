# Agent instructions

Read the relevant documentation before changing code:

- [Product scope](docs/product/vision.md) and [roadmap](docs/planning/roadmap.md)
- [Architecture](docs/architecture/system.md) and [decisions](docs/README.md#decisions)
- [Delivery workflow](docs/engineering/delivery.md) and [security](docs/engineering/security.md)

## Rules

- Work on one scoped Issue/PR at a time; a milestone may have multiple PRs.
- Start from `main` on a short-lived branch. Keep `main` buildable.
- Follow [ADR 0002](docs/decisions/0002-delivery-strategy.md) when naming branches: `feature/<name>` for features, `fix/<name>` for fixes, `chore/<name>` for maintenance, and `docs/<name>` for documentation. Use these prefixes instead of agent defaults such as `codex/`.
- Explain the change and acceptance checks before implementation.
- Prefer straightforward, maintainable code; justify dependencies and cloud costs.
- Review existing APIs and versions; never invent dependencies, results, or completed tests.
- Add relevant tests. Never silently skip, weaken, or delete tests to pass CI.
- Treat authentication, tenant isolation, data modifications, and AI tool calls as security boundaries.
- Never commit or print tokens, passwords, customer data, or cloud credentials.
- Do not merge, deploy, modify IAM, or run destructive migrations without developer authorization.
- Report actual commands run and any failures in the PR.

An independent AI reviewer provides suggestions, **not approval**. The developer reviews all generated changes and resolves comments.

App-level `AGENTS.md` files can be added when the apps are scaffolded.
