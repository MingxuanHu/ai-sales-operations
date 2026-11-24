# AI Sales Operations

[Open the public demo](https://d3finwpuxpr8bj.cloudfront.net) to sign in and try organisation onboarding.

> **Status:** [Milestone 5 kickoff — Master data](docs/milestones/M05-01-master-data.md). Up next are the administrator invitation UI and product and customer management.

A portfolio-oriented, multi-tenant sales operations SaaS for B2B wholesalers, with an AI copilot for sales analytics, policy-aware answers, and human-approved follow-up actions.

## Product

- **Manage sales:** organisations, customers, products, sales orders, and a sales dashboard.
- **Approve discounts:** orders above a configurable discount threshold require a manager's decision.
- **Ask the copilot:** query sales metrics with natural language, retrieve cited business policies, and propose review tasks. Business rules and approvals remain deterministic.

All demo data is synthetic. No payments, inventory fulfilment system, or customer billing are included in the initial scope.

## Technology

React · TypeScript · Vite · NestJS · PostgreSQL · Prisma · Amazon Cognito · AWS Lambda · S3/CloudFront · Neon · LLM APIs

## AI-assisted software delivery

I build this project with help from coding agents. I review their changes and check results before a PR is opened, and I decide whether to merge. Required CI checks run on each PR, and merging into protected `main` deploys the public demo automatically. I’ve postponed advisory AI PR review while I look for a suitable AI reviewer.

Development rules: [AGENTS.md](AGENTS.md) · [Delivery workflow](docs/engineering/delivery.md)

## Getting started

See [Local development](docs/engineering/local-development.md) to start the web and API health shell and run the workspace checks.

[Documentation index](docs/README.md) · [Roadmap](docs/planning/roadmap.md) · [Architecture](docs/architecture/system.md)

## License

[MIT](LICENSE) — permissive reuse with no warranty.
