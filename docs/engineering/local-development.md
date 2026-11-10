# Local development

**Goal:** one command to start React, NestJS and local PostgreSQL. AWS compute services and Neon are **not** needed for normal development.

## Planned commands (implemented in M1)

```bash
cp .env.example .env
pnpm install
pnpm dev:up     # Docker PostgreSQL + NestJS + Vite
pnpm check      # lint, typecheck, tests, build
pnpm dev:down
```

These are target commands, **not working commands in this planning-only package**.

## Environments

| | Local | CI | Public demo |
| --- | --- | --- | --- |
| Web/API | Vite + NestJS HTTP | Ephemeral test runner | S3/CloudFront + Lambda |
| Database | Docker PostgreSQL | Temporary PostgreSQL | Neon PostgreSQL |
| Login (from M2) | Development Cognito User Pool | Mocked JWT/JWKS boundary | Separate demo Cognito User Pool |

Vite proxies `/api` to NestJS. The demo routes `/api/*` through CloudFront to API Gateway.

## Cognito prerequisite (from M2)

Create a development User Pool and public app client, enable Managed Login and Authorization Code + PKCE, and allow localhost redirect/logout URLs. Configure the **public** issuer/domain/client ID in local environment settings; do not put a client secret in React. Live login requires an internet connection. Local backend validates tokens and checks membership in local PostgreSQL.

M1 stays runnable without Cognito; CI identity tests use controlled token fixtures. Never enable a test-auth bypass in a public deployment.
