# M02 - 01 — Identity

**Goal:** A synthetic user can register and sign in from the local React app, enter an organisation they belong to, and use its protected API. The API denies access to organisations outside the user's memberships.

## Scope and acceptance

- **In scope.** Identity and tenant design, a development Cognito User Pool, registration and sign-in through Managed Login, social federation, PostgreSQL organisation onboarding, membership and role checks, and a protected React shell.
- **Out of scope.** Public demo Cognito resources and cloud hosting (M3), deployment IAM and CI/CD (M4), and sales workflows. Use synthetic accounts and organisations.
- **Acceptance evidence.** Register and verify a synthetic account against development Cognito, sign in, enter an authorised organisation, and sign out. Repeat sign-in with Google. Demonstrate creation of a synthetic organisation with its first administrator and onboarding of a second user. Verify that a signed-in account without membership sees an appropriate empty state. In integration tests backed by PostgreSQL, verify that invalid authentication, missing membership, and insufficient role permissions are denied and that an authorised member succeeds. Run `pnpm check` with Docker. Automated checks use synthetic fixtures and run without AWS credentials or live Cognito access.

## Issues / PRs

Track delivery in the [M2 Identity GitHub milestone](https://github.com/MingxuanHu/ai-sales-operations/milestone/2). Follow the [delivery workflow](../engineering/delivery.md#milestone-kickoff-and-github-issues). The design is the dependency for both cloud configuration and API implementation. The protected web shell uses both, and the final live smoke test exercises the complete path.

### 1. Design Cognito identity and organisation access

[Issue #12](https://github.com/MingxuanHu/ai-sales-operations/issues/12) · [PR #17](https://github.com/MingxuanHu/ai-sales-operations/pull/17)

- **Goal.** Publish a reviewed design that later features can use for identity, membership and authorisation. See the [Identity architecture, schema and diagrams](../architecture/identity.md).
- **Database design.** Produce an ER diagram and a schema specification for application users, external identities, organisations, memberships and any records needed for onboarding. Specify columns, types, keys, foreign keys, uniqueness, indexes, role and status values, and lifecycle rules. Define the stable identity key from verified Cognito claims and the rules for linking identities across sign-in methods. Matching email addresses alone must never link accounts or grant membership.
- **Onboarding design.** Decide who can create organisations and how the first administrator is assigned atomically. Decide how a signed-in user joins an existing organisation. Use administrator-issued invitations as the starting proposal. Specify who can invite, how the invite is bound to the intended recipient, how it expires or is revoked, and how acceptance handles retries. New sign-ins start without memberships unless an authorised onboarding flow grants access. Define organisation selection, role changes, and membership removal. Confirm that switching organisations loads the role for the selected membership.
- **Sign-in design.** Include native Cognito registration and sign-in plus Google through Managed Login. Defer Facebook. Evaluate Microsoft sign-in for personal Outlook.com accounts and separately decide whether work or school accounts belong in scope. Evaluate LinkedIn and any other proposed providers against Cognito's federation requirements, provider access and review requirements, and costs. Record which providers are accepted for M2 and why. Specify token validation, storage, refresh, logout, and the protected API contract.
- **Out of scope.** Prisma implementation, application code and AWS resource changes.
- **Acceptance and validation.** Review the schema and flows against the [identity ADR](../decisions/0004-identity.md) and [security guidance](../engineering/security.md). Walk through first-admin provisioning, invitation acceptance and replay, multi-organisation selection, membership removal, and attempted cross-tenant access. Once the flows are agreed, publish Mermaid sequence diagrams showing native and federated sign-in, onboarding, and tenant access across the user browser, Cognito, Google, NestJS and PostgreSQL. Show where redirects, token exchange, token validation, and membership decisions happen. Run `node scripts/check-docs.mjs`.
- **Dependencies.** M1 foundation.

### 2. Configure development AWS and Cognito

[Issue #13](https://github.com/MingxuanHu/ai-sales-operations/issues/13) · [PR #18](https://github.com/MingxuanHu/ai-sales-operations/pull/18)

- **Goal.** Make Cognito Managed Login available for local development and record how to reproduce the configuration.
- **In scope.** Write the detailed [AWS and Cognito setup and verification runbook](../engineering/aws-cognito-development.md) as part of this issue. Define the development User Pool, Managed Login domain, public app client, local callback and sign-out URLs, verification settings, OAuth scopes and approved identity providers in a CloudFormation stack, using CDK as specified in the [hosting ADR](../decisions/0003-hosting.md). Document provider-side app registration and secret handling in the runbook. Review a change set before applying it, especially any replacement of the User Pool. AWS charges no additional CloudFormation fee for native AWS resources. Check [Cognito pricing](https://aws.amazon.com/cognito/pricing/) and any secret storage costs before provisioning. See [CloudFormation pricing](https://aws.amazon.com/cloudformation/pricing/). Document the non-secret identifiers used by the web and API and the settings to carry into M3.
- **Out of scope.** React or NestJS feature changes, demo pool provisioning, hosting and IAM changes.
- **Acceptance and validation.** Review the runbook and compare the configured resources with it. Verify that an update preserves the existing pool and that each approved provider completes federated sign-in. With a synthetic account and a local OAuth client, verify registration and verification, successful authorisation-code exchange with PKCE, the API audience in initial and refreshed access tokens, refresh-token rotation, the local callback and sign-out redirects, and rejection of an unregistered redirect. Record the settings and smoke-test results without saving credentials or tokens. Run `node scripts/check-docs.mjs`.
- **Dependencies.** Issue 1. See the [local architecture](../architecture/system.md#local-development-target-from-m2). Issue 12. See the [Identity architecture, schema and diagrams](../architecture/identity.md).


### 3. Implement API identity and tenant authorisation

[Issue #14](https://github.com/MingxuanHu/ai-sales-operations/issues/14)

- **Goal.** Give future NestJS features a shared way to authenticate callers and enforce organisation membership and roles.
- **In scope.** Implement the schema specified in Issue 1 as Prisma models and migrations. Implement the agreed organisation creation and membership onboarding flows. Implement access-token verification, identity resolution, membership lookup and tenant-scoped permission checks. Expose the signed-in user's memberships and a protected path that exercises tenant access. Keep test fixtures isolated. Add an explicit, repeatable Prisma seed command for local synthetic data if the onboarding flows alone cannot support the smoke tests. Document the M3 demo handoff for applying schema migrations and bootstrapping a synthetic organisation and first administrator against the separate demo pool and database. Run demo onboarding in M3.
- **Out of scope.** React login UI, Cognito resource changes and sales feature endpoints.
- **Acceptance and validation.** Run `pnpm check` with Docker. Cover invalid or missing tokens, first-admin provisioning, authorised onboarding, membership changes, permitted requests, insufficient roles and cross-organisation denial with automated tests. Exercise database-backed membership and role checks with synthetic identities and a controlled token verifier.
- **Dependencies.** Issue 1. Implementation can proceed alongside Issue 2 using the agreed token contract.

### 4. Add the protected React shell and verify local sign-in

[Issue #15](https://github.com/MingxuanHu/ai-sales-operations/issues/15)

- **Goal.** Complete the browser-to-Cognito-to-API workflow on the local stack.
- **In scope.** Connect the shell to Managed Login for registration and sign-in with the approved providers. Expose the onboarding steps available to users under the Issue 1 design. Handle the callback, session lifecycle and logout according to the design. Load available organisations from the API, allow selection where applicable, and show signed-out, no-membership and access-denied states.
- **Out of scope.** Organisation administration UI, sales screens and public deployment.
- **Acceptance and validation.** Run `pnpm check` with Docker and test the protected shell states with mocked identity. Follow the runbook from a clean local setup and complete the live milestone smoke test with synthetic accounts. Confirm that the browser uses the selected organisation for API requests, a tenant switch updates the displayed context, and sign-out returns the shell to its signed-out state.
- **Dependencies.** Issues 2 and 3.
