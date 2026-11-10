# ADR 0003 — Low-cost public hosting

**Status:** Proposed; validate in M3.

- Frontend: private **S3** behind **CloudFront**.
- API: **API Gateway HTTP API → Lambda (NestJS)**; CloudFront forwards `/api/*` without caching authorised responses.
- Database: **Neon PostgreSQL**; pooled application URL, direct migration URL. pgvector added for RAG.
- Infrastructure: **AWS CDK (TypeScript)**, GitHub Actions deploy via OIDC.
- Secrets: SSM Parameter Store SecureString for runtime secrets; protected deployment-only migration connection.

**Why:** Minimise idle compute cost. If Lambda or ORM compatibility becomes difficult, use a small Lightsail instance running the same NestJS business modules.

Check current quotas/prices before provisioning. Configure budgets and rate limits; budget alerts do not cap charges.
