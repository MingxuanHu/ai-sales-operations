# Roadmap

**12 milestones across 5 phases.** Each milestone is a deliverable, **not a single PR**. Work is split into reviewable Issues/PRs. Target effort is **3–4 focused development days per milestone**; this is an estimate, not a deadline.

| Phase | Milestone | Deliverable |
| --- | --- | --- |
| 1 · Foundation | M1 — Bootstrap | React/NestJS workspace, local PostgreSQL, AGENTS.md, baseline CI |
| 1 · Foundation | M2 — Identity | Cognito login/register, protected React shell, organisation membership and tenant checks |
| 2 · Delivery | M3 — First cloud deploy | CloudFront/S3, API Gateway/Lambda, Neon, Cognito demo configuration, public HTTPS |
| 2 · Delivery | M4 — CI/CD & AI review | Protected `main`, OIDC deployment, AI PR comments, automated demo release |
| 3 · Sales SaaS | M5 — Master data | Product/customer CRUD, validation and UI |
| 3 · Sales SaaS | M6 — Orders & approvals | Order lifecycle, discount rule, manager approvals, audit and seed data |
| 3 · Sales SaaS | M7 — Dashboard | Accurate sales metrics, ranking, date filtering and charts |
| 4 · Applied AI | M8 — Analytics copilot | Natural-language questions via authorised metric tools |
| 4 · Applied AI | M9 — Document ingestion | Tenant-scoped policy upload, chunking, embeddings and vector search |
| 4 · Applied AI | M10 — RAG answers | Grounded policy answers with citations and safe no-answer behaviour |
| 4 · Applied AI | M11 — AI-assisted actions | Proposed follow-up tasks, human confirmation, backend validation |
| 5 · Portfolio | M12 — Quality & showcase | AI evals, E2E, security review, docs and demo video |

**Order:** M1 → M2 → M3 → M4, then feature milestones. After M4, every merged PR exercises the deployed delivery pipeline.

**Milestone specifications:** create one focused `docs/milestones/Mxx-xx-<name>.md` at kickoff, then link its title in this table. No empty or speculative M1 plan is included in this pack. Use the [milestone template](../milestones/TEMPLATE.md).
