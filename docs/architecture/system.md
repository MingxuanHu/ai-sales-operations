# System architecture

The **same NestJS business modules** serve local HTTP requests and AWS Lambda requests. Only the entrypoint/adapter changes.

## Public demo (target from M3)

```mermaid
flowchart TB
    Browser["Browser · React"]
    Cognito["Amazon Cognito<br/>Managed Login + OIDC PKCE"]
    CF["CloudFront · HTTPS"]
    S3["Private S3 · React assets"]
    APIGW["API Gateway · HTTP API"]
    Lambda["AWS Lambda · NestJS API"]
    DB[("Neon PostgreSQL<br/>pgvector from M10")]
    Model["LLM API · from M9"]

    Browser <-->|"Sign in / redirect"| Cognito
    Browser -->|"App and /api requests"| CF
    CF -->|"Static paths"| S3
    CF -->|"/api/* · no API caching"| APIGW
    APIGW --> Lambda
    Lambda -->|"JWT verification · JWKS"| Cognito
    Lambda --> DB
    Lambda -.-> Model
```

Cognito authenticates users. NestJS resolves organisation membership and enforces tenant-scoped authorisation on every protected request. The LLM cannot bypass business services or approve orders.

## Local development (target from M2)

```mermaid
flowchart LR
    Browser["Browser"] --> Vite["Vite · :5173"]
    Vite -->|"/api proxy"| Nest["NestJS · :3000"]
    Nest --> PG[("PostgreSQL 18 · Docker")]
    Browser <-->|"Login · internet required"| DevCognito["Development Cognito User Pool"]
    Nest -.->|"Validate JWT via JWKS"| DevCognito
```

M1 runs the web/API health shell and local database **without** Cognito. Real login added in M2 uses a separate development User Pool; automated tests can mock token verification without a live AWS dependency.

## Design boundaries

- Modular monolith, PostgreSQL transactional data, controlled metrics/query APIs.
- React never receives database or LLM credentials.
- Public demo uses synthetic data and one low-cost cloud environment; no always-on staging stack.
- From M3, local HTTP entrypoint and Lambda adapter share controllers, guards and services.
