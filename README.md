# AI Sales Operations

A portfolio-oriented, multi-tenant sales operations SaaS for B2B wholesalers, with an AI copilot for sales analytics, policy-aware answers, and human-approved follow-up actions.

> **Status:** Planning. Application code and public demo have not been built yet.

## Product

- **Manage sales:** organisations, customers, products, sales orders, and a sales dashboard.
- **Approve discounts:** orders above a configurable discount threshold require a manager's decision.
- **Ask the copilot:** query sales metrics with natural language, retrieve cited business policies, and propose review tasks. Business rules and approvals remain deterministic.

All demo data is synthetic. No payments, inventory fulfilment system, or customer billing are included in the initial scope.

## Technology

React · TypeScript · Vite · NestJS · PostgreSQL · Prisma · Amazon Cognito · AWS Lambda · S3/CloudFront · Neon · LLM APIs

## AI-assisted software delivery

Coding agents propose implementation and tests in small PRs. A separate AI reviewer comments on the diff; the developer checks every change and decides whether to merge. Required CI checks run on each PR. From M4, merging into protected `main` deploys the public demo automatically.

Milestone kickoff ends when the approved GitHub Issues are linked in the milestone specification. Issue implementation begins on a separate developer request.

Development rules: [AGENTS.md](AGENTS.md) · [Delivery workflow](docs/engineering/delivery.md)

## Getting started

The application is not scaffolded yet. Planned local startup, including the separate development Cognito configuration required from M2, is described in [Local development](docs/engineering/local-development.md).

[Documentation index](docs/README.md) · [Roadmap](docs/planning/roadmap.md) · [Architecture](docs/architecture/system.md)

## License

[MIT](LICENSE) — permissive reuse with no warranty.
