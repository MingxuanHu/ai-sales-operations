# AI Sales Operations

A portfolio-oriented, multi-tenant sales operations SaaS for B2B wholesalers, with an AI copilot for sales analytics, policy-aware answers, and human-approved follow-up actions.

> **Status:** M1 bootstrap. The React and NestJS health shell runs locally.

## Product

- **Manage sales:** organisations, customers, products, sales orders, and a sales dashboard.
- **Approve discounts:** orders above a configurable discount threshold require a manager's decision.
- **Ask the copilot:** query sales metrics with natural language, retrieve cited business policies, and propose review tasks. Business rules and approvals remain deterministic.

All demo data is synthetic. No payments, inventory fulfilment system, or customer billing are included in the initial scope.

## Technology

React · TypeScript · Vite · NestJS · PostgreSQL · Prisma · Amazon Cognito · AWS Lambda · S3/CloudFront · Neon · LLM APIs

## AI-assisted software delivery

Coding agents present local changes and check results for developer review before opening a PR. A separate AI reviewer comments on the PR diff, and the developer decides whether to merge. Required CI checks run on each PR. From M4, merging into protected `main` deploys the public demo automatically.

Development rules: [AGENTS.md](AGENTS.md) · [Delivery workflow](docs/engineering/delivery.md)

## Getting started

See [Local development](docs/engineering/local-development.md) to start the web and API health shell and run the workspace checks.

[Documentation index](docs/README.md) · [Roadmap](docs/planning/roadmap.md) · [Architecture](docs/architecture/system.md)

## License

[MIT](LICENSE) — permissive reuse with no warranty.
