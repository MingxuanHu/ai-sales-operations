# ADR 0003 — Low-cost public hosting

**Status:** Proposed; validate in M3.

- Frontend: private **S3** behind **CloudFront**.
- API: **API Gateway HTTP API → Lambda (NestJS)**; CloudFront forwards `/api/*` without caching authorised responses.
- Database: **Neon PostgreSQL**; pooled application URL, direct migration URL. pgvector added for RAG.
- Infrastructure: **AWS CDK (TypeScript)**, GitHub Actions deploy via OIDC.
- Secrets: SSM Parameter Store SecureString for runtime secrets; protected deployment-only migration connection.

**Why:** Minimise idle compute cost. If Lambda or ORM compatibility becomes difficult, use a small Lightsail instance running the same NestJS business modules.

Check current quotas/prices before provisioning. Configure budgets and rate limits; budget alerts do not cap charges.

## Application configuration

Use one repository-root `.env` for local React and NestJS configuration. Commit `.env.example` as the template. Record shared public Cognito values once under their `VITE_` names so the local browser build can read them. Map those values to the corresponding NestJS settings at the local configuration boundary. NestJS keeps its own configuration contract in every environment. Keep backend-only values under unprefixed names. Use `.env.aws` and its example template for infrastructure setup details.

For the deployed demo, configure each target at the point where it reads its settings.

| Target | Configuration |
| --- | --- |
| React on S3 and CloudFront | Supply public `VITE_*` values to the Vite build. The resulting JavaScript includes those values. Rebuild and publish the static assets when a value changes. |
| NestJS on Lambda | Supply backend configuration at runtime using Lambda environment variables. Retrieve runtime secrets from SSM Parameter Store SecureString as described in [security and secrets](../engineering/security.md). |

Use the demo Cognito stack outputs and demo API resource URL to configure both deployment targets. For example, supply the same public client ID as `VITE_COGNITO_CLIENT_ID` to the build and as `COGNITO_APP_CLIENT_ID` to Lambda. Keep the local env files out of deployment artifacts.
