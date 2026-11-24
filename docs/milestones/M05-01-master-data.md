# M05 - 01 — Master data

**Goal.** Give company administrators a browser workflow for inviting staff and managing the organisation's products and customers before order entry in M6.

## Scope and acceptance

- **In scope.** Complete the administrator invitation flow deferred in M2. Add tenant-scoped product and customer CRUD, server-side validation, and React screens.
- **Out of scope.** Orders, inventory, payments, email delivery or email-based account lookup, and a general membership administration console.
- **Acceptance evidence.** Using synthetic accounts, an administrator issues an invitation and the recipient accepts it in the existing inbox. Administrators can create, list, view, edit and remove products and customers. API integration tests cover current role checks and tenant isolation. Web tests cover the main flows and errors.

## Proposed Issues / PRs

### 1. Complete the company administrator invitation UI

- **Goal.** Let an administrator invite staff from the selected organisation without calling the API manually.
- **In scope.** Design and build the form for a recipient's shared application user ID and one of the existing roles. Show submission, confirmation with expiry, and recoverable errors. Let the administrator revoke the invitation from its confirmation. Keep the available actions tied to the selected organisation and its current role.
- **Out of scope.** Email invitations, directory search, and browsing previously issued invitations. A persistent management view would require an administrator listing API.
- **Acceptance.** The UI handles successful issuance and same-role retries, explains conflicting invitations, and clears organisation-specific state on switch. Non-admins have no invitation controls and the API continues to enforce authorisation. With two synthetic accounts, verify that a recipient can accept an issued invitation and that a revoked invitation cannot grant membership.
- **Dependencies.** [M2 issue #15](https://github.com/MingxuanHu/ai-sales-operations/issues/15) delivered recipient onboarding and excluded organisation administration. Reuse the existing [identity API](../architecture/identity.md#protected-api-contract). This issue also picks up the deferred [M3 invitation smoke test](M03-01-first-cloud-deploy.md) once the UI is available in the demo.
- **Validation.** Add web tests for issuance, revocation, errors, role visibility and organisation switching. Run `pnpm check` with Docker and exercise the two-account browser flow locally. Record the demo smoke test after release.

### 2. Add product CRUD

- **Goal.** Give administrators a product catalogue for their organisation.
- **In scope.** Add the Prisma migration, NestJS routes and React screens for product CRUD. Define the minimum fields and constraints needed by M6, including SKU, name and unit price.
- **Out of scope.** Inventory, imports and price history.
- **Acceptance.** Administrators can manage products in the selected organisation. Invalid input and duplicate SKUs within an organisation produce actionable errors. Another organisation can use the same SKU. Foreign records cannot be read or changed through direct API requests.
- **Dependencies.** Existing identity and tenant authorisation. Scheduled after the invitation UI.
- **Validation.** Run `pnpm check` with Docker. Cover role enforcement, validation and tenant isolation in API integration tests and exercise CRUD and errors in React.

### 3. Add customer CRUD

- **Goal.** Give administrators a customer directory for their organisation.
- **In scope.** Add the Prisma migration, NestJS routes and React screens for customer CRUD. Define the minimum customer fields needed for selecting a customer in M6.
- **Out of scope.** Customer sign-in, messaging and bulk imports.
- **Acceptance.** Administrators can manage customer records in the selected organisation. Invalid input produces actionable errors. Foreign records cannot be read or changed through direct API requests.
- **Dependencies.** Existing identity and tenant authorisation. Scheduled after product CRUD so the two workflows can follow the same conventions.
- **Validation.** Run `pnpm check` with Docker. Cover role enforcement, validation and tenant isolation in API integration tests and exercise CRUD and errors in React.

Follow the [milestone kickoff workflow](../engineering/delivery.md#milestone-kickoff-and-github-issues) to confirm the breakdown and record the GitHub milestone and issue links.
