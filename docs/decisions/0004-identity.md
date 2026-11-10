# ADR 0004 — Identity and tenant access

**Status:** Accepted for design; implement in M2.

- Use **Amazon Cognito User Pools** for user registration, login, verification and token issuance.
- React authenticates with **Cognito Managed Login, OAuth 2.0 Authorization Code + PKCE** (public client; no client secret in the browser).
- NestJS validates access tokens against Cognito's issuer/JWKS.
- PostgreSQL owns organisations, memberships and application roles. Every protected API/query verifies the active tenant's membership and permissions.
- Use a separate development User Pool and demo User Pool, not one User Pool per tenant.

**Trade-off:** Local signup/login requires internet access and a configured development Cognito pool. M1's local shell does not; CI tests mock the identity boundary. Token handling, refresh and logout details are finalised with a security review in M2; do not assume a local mock is safe for production.
