# Agent instructions

Read the relevant documentation before changing code:

- [Product scope](docs/product/vision.md) and [roadmap](docs/planning/roadmap.md)
- [Architecture](docs/architecture/system.md) and [decisions](docs/README.md#decisions)
- [Delivery workflow](docs/engineering/delivery.md) and [security](docs/engineering/security.md)

## Rules

- If a developer request conflicts with a rule in this file or an applicable repository workflow it references, identify the conflict, cite the relevant rule, and ask the developer how to proceed before taking the affected action. Continue any work that does not depend on that decision.

- Use the repository-root `.env` as the sole local environment file for React and NestJS, and keep its template in `.env.example`. Define shared app settings once. Keep `.env.aws` and `.env.aws.example` for infrastructure setup metadata only. Follow the [application configuration decision](docs/decisions/0003-hosting.md#application-configuration) for local mapping and separate web build and Lambda runtime settings.

- For milestone kickoff, read and follow the [milestone kickoff workflow](docs/engineering/delivery.md#milestone-kickoff-and-github-issues). When review feedback or PR approval arrives, check whether the issue breakdown has been confirmed and resume any remaining kickoff steps under that workflow. If confirmation is still pending, call it out separately from PR approval.
- Work on one scoped Issue/PR at a time; a milestone may have multiple PRs.
- Start from `main` on a short-lived branch. Keep `main` buildable.
- Follow [ADR 0002](docs/decisions/0002-delivery-strategy.md) when naming branches: `feature/<name>` for features, `fix/<name>` for fixes, `chore/<name>` for maintenance, and `docs/<name>` for documentation. Use these prefixes instead of agent defaults such as `codex/`.
- Explain the change and acceptance checks before implementation.
- Before handing back, stop the local servers and containers you started for testing, even if a check failed. Leave pre-existing services running. Verify that the services you stopped released their ports. Keep test services running only if the developer asks you to.
- At the end of each turn that changes repository files, validate the work and make a local commit containing only the changes from that turn. Commit without waiting for separate confirmation unless the developer asks to leave the changes uncommitted.
- After implementation and validation, present the local changes and check results for developer review. Create the pull request only after the developer reviews the changes and explicitly tells you to proceed.
- Prefer straightforward, maintainable code; justify dependencies and cloud costs.
- Write concise teaching comments throughout new or changed code for a reader new to JavaScript, TypeScript, React and NestJS. Introduce unfamiliar syntax and framework concepts where they appear, and explain what they do in that file. Keep each comment focused on one idea and update it when the code changes.
- Review existing APIs and versions; never invent dependencies, results, or completed tests.
- Add relevant tests. Never silently skip, weaken, or delete tests to pass CI.
- Treat authentication, tenant isolation, data modifications, and AI tool calls as security boundaries.
- Never commit or print tokens, passwords, customer data, or cloud credentials.
- Do not merge, deploy, modify IAM, or run destructive migrations without developer authorization.
- Report actual commands run and any failures in the PR.

An independent AI reviewer provides suggestions, **not approval**. The developer reviews all generated changes and resolves comments.

App-level `AGENTS.md` files can be added when the apps are scaffolded.
