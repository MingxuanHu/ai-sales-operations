# Security and secrets

Public source does not imply public credentials. Never commit `.env`, database URLs, model keys, AWS access keys or private business data.

| Secret or credential | Local | CI / PR | Demo |
| --- | --- | --- | --- |
| PostgreSQL | Local Docker-only credentials | Temporary test DB | Neon URL in AWS SSM SecureString |
| Migration connection | Local direct URL | Test DB | Protected deploy-only secret, direct Neon URL |
| AI provider key | Local `.env` or mock (from M8) | Mock | AWS SSM SecureString |
| AWS deployment access | Personal authenticated CLI | None | Short-lived GitHub OIDC role |

Cognito **public app client ID, domain and User Pool ID are identifiers**, not credentials; browser apps must never contain a Cognito app client secret. React sends access tokens to NestJS; the backend validates issuer, signature, expiry, intended token use and client/audience as appropriate. Token storage/refresh is an M2 security decision.

- PR workflows must not access deployment secrets or use privileged `pull_request_target` execution on untrusted changes.
- Restrict AWS OIDC trust to the actual repository identity and trusted `demo` environment; restrict permissions to required resources.
- Enforce authorisation at every tenant-scoped API, database query and AI tool call.
- Demo uses synthetic data, rate limits, cost alerts and explicit human approval for writes suggested by AI.
