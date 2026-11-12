# Security and secrets

Public source does not imply public credentials. Never commit `.env`, database URLs, model keys, AWS access keys or private business data.

| Secret or credential | Local | CI / PR | Demo |
| --- | --- | --- | --- |
| PostgreSQL application connection (`DATABASE_URL`) | Direct URL to local Docker DB | Direct URL to temporary test DB | Pooled Neon URL in AWS SSM SecureString |
| PostgreSQL schema migration connection (`DIRECT_URL`) | Same local URL and credentials as the application | Direct URL to temporary test DB | Protected deploy-only secret, direct Neon URL |
| AI provider key | Local `.env` or mock (from M9) | Mock | AWS SSM SecureString |
| AWS deployment access | Personal authenticated CLI | None | Short-lived GitHub OIDC role |

## PostgreSQL connection URLs

NestJS reads `DATABASE_URL` for runtime queries and writes. `DIRECT_URL` is reserved for Prisma schema migrations and will be wired up when the first migration is added in M2. The name refers to a direct PostgreSQL endpoint that bypasses a connection pooler.

Set both variables to the same direct URL and Docker credentials in local development. In the online demo, set `DATABASE_URL` to the pooled Neon URL with a role limited to application operations. Set `DIRECT_URL` to the direct URL for the same Neon database with a separate role that can change the schema. Provide the migration credential only to the deployment step that runs migrations.

Neon supports Prisma schema migrations through its pooled endpoint. We use the direct endpoint for demo migrations because the transaction pooler can assign a different PostgreSQL connection after each transaction. A direct connection preserves session state across transactions, and an occasional deployment gains little from pooling. PostgreSQL roles enforce the privilege split independently of which endpoint each role uses. See [Neon’s Prisma migration support](https://neon.com/blog/better-postgres-with-prisma-experience) and [Neon’s connection pooling guidance](https://neon.com/blog/inside-lubots-database-per-tenant-architecture).

Bootstrapping the demo organisation and its first administrator is a separate data operation using synthetic data and identities from the demo Cognito pool.

## Identity and deployment

Cognito **public app client ID, domain and User Pool ID are identifiers**, not credentials; browser apps must never contain a Cognito app client secret. React sends access tokens to NestJS; the backend validates issuer, signature, expiry, intended token use and client/audience as appropriate. Token storage/refresh is an M2 security decision.

- Keep upstream social provider client secrets in protected configuration for Cognito federation. Keep them out of browser configuration, stack outputs, repository files and logs. PostgreSQL membership determines organisation access regardless of sign-in method.
- PR workflows must not access deployment secrets or use privileged `pull_request_target` execution on untrusted changes.
- Restrict AWS OIDC trust to the actual repository identity and trusted `demo` environment; restrict permissions to required resources.
- Enforce authorisation at every tenant-scoped API, database query and AI tool call.
- Demo uses synthetic data, rate limits, cost alerts and explicit human approval for writes suggested by AI.
