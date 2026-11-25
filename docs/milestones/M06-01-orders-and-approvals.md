# M06 - 01 — Orders & approvals

**Goal.** A salesperson can submit a synthetic order, a manager can decide whether to approve an above-threshold discount, and the salesperson can fulfil an approved order. The organisation can trace each state change.

## Scope and acceptance

- **In scope.** Tenant-scoped order entry and history, an organisation-level order discount threshold that defaults to 10%, manager decisions, fulfilment, a transactional order audit trail and a repeatable, full synthetic organisation for the M7 demo.
- **Out of scope.** Saved drafts, edits after submission, cancellation, returns, tax, shipping, inventory, payments, notifications, dashboards and the GraphQL order detail query.
- **Acceptance evidence.** Using synthetic staff accounts in the browser, submit orders at 10% and above 10%. Fulfil the first, approve and fulfil one pending order, and reject another. Verify each history, verify that pending and rejected orders cannot be fulfilled, and exercise an organisation switch. API integration tests demonstrate tenant isolation, role enforcement, money calculations, retry handling and competing transitions.

### Proposed business rules

- An active salesperson submits an order for one customer with at least one line item, positive whole quantities and a single order-wide discount from 0% to 100% with up to two decimal places. The server resolves customer and product IDs within the organisation, snapshots the customer name and product SKU, name and unit price, and calculates the subtotal and discounted total using exact arithmetic. Apply the discount to the subtotal and round the final total to cents, with half cents rounded up. Preserve order history through later catalogue changes and deletions.
- Submission at or below the organisation’s threshold creates an approved order. Submission above it creates a pending order. Each order records the threshold used at submission. An active manager can approve or reject a pending order. The submitting salesperson can fulfil their own approved order. Fulfilled and rejected orders are terminal.
- Salespeople can read their own orders and use limited customer and product selectors for entry. Managers can read all orders in their organisation and filter for pending decisions. Administrators retain their existing master-data permissions. Apply current membership and tenant checks on the server, including when resolving referenced records.
- Record submission, automatic or manual approval, rejection and fulfilment with the applicable actor, timestamp and state change. Write history and state together. A repeated submission with the same request key and payload returns the original order. Competing decisions or fulfilment attempts must produce at most one transition and audit event for that step.
- For M7, count fulfilled orders only. Attribute sales to the fulfilment timestamp. Net sales sum stored discounted totals, and product net sales allocate each order's discount across its lines so allocated cents reconcile to the stored order total. M7 owns reporting and the allocation implementation.

## Issues / PRs

**Kickoff complete.** The approved breakdown is tracked in the [M6 — Orders & approvals GitHub milestone](https://github.com/MingxuanHu/ai-sales-operations/milestone/6). Follow the [delivery workflow](../engineering/delivery.md#issue-implementation) for implementation.

### 1. Add tenant-scoped order submission and read APIs

[Issue #56](https://github.com/MingxuanHu/ai-sales-operations/issues/56) · [PR #63](https://github.com/MingxuanHu/ai-sales-operations/pull/63)

- **Goal.** Persist valid orders and the submission decision using organisation master data.
- **In scope.** Add the Prisma migration, order and line snapshots, audit storage, limited selectors, scoped list and detail reads, and idempotent submission. Apply the discount rule at submission.
- **Out of scope.** Manual decisions, fulfilment and React screens.
- **Acceptance.** With default settings, orders at 10% are approved and orders at 10.01% are pending. A configured threshold applies to new orders for that organisation. Invalid quantities and discounts fail with actionable errors. Foreign IDs cannot be read or used to submit. Price edits and master-data deletions preserve prior order details. Identical concurrent submissions converge on one order and one history, and reuse of a key for different input returns a conflict.
- **Dependencies.** [M5 master data](M05-01-master-data.md) and the [identity and tenant authorisation rules](../architecture/identity.md).
- **Validation.** Run `pnpm check` with Docker. Cover role and tenant scope, rounding and threshold boundaries, historical snapshots and concurrent retries in automated tests.

The authenticated API uses `/api/organisations/:organisationId/orders`.

| Method and path relative to that base | Behaviour |
| --- | --- |
| `POST` | A salesperson submits `{ requestId, customerId, discountPercent, lines: [{ productId, quantity }] }`. Use a new UUID for each order and reuse it for retries. The discount is a decimal string, and quantities are JSON integers. Returns the order detail with HTTP 201, including on a matching retry. A changed order with the same request ID returns HTTP 409. |
| `GET` | Salespeople list their own orders. Managers list organisation orders and can use `?status=pending` for the approval queue. |
| `GET /:id` | Returns a scoped order with customer and line snapshots and ordered audit history. |
| `GET /selectors` | Returns customer IDs and names and product IDs, SKUs, names and prices for salesperson entry. |

PostgreSQL stores organisation settings in the `organisations.settings` JSONB column.
The optional `orderApprovalThresholdBasisPoints` key accepts integers from 0 through 10000,
where 1000 represents 10%. An absent key uses 10%. Order responses include
`approvalThresholdPercent` as a two-place decimal string, like the money and discount fields. A system approval
has a null actor, and the submission event records the submitting user.

### 2. Add manager decisions and fulfilment APIs

[Issue #57](https://github.com/MingxuanHu/ai-sales-operations/issues/57) · [PR #64](https://github.com/MingxuanHu/ai-sales-operations/pull/64)

- **Goal.** Enforce manual approval, rejection and fulfilment with a complete history.
- **In scope.** Add decision and fulfilment commands using the existing organisation transaction policy. Expose the recorded history through the scoped order detail API.
- **Out of scope.** Reopening, cancellation and browser controls.
- **Acceptance.** Only managers decide pending orders. Only the submitting salesperson fulfils an approved order. Stale or conflicting transitions return a conflict and leave history unchanged. Concurrent actions yield one recorded transition, and a failed audit write rolls back the state change.
- **Dependencies.** Issue 1 and the [identity mutation policy](../architecture/identity.md).
- **Validation.** Run `pnpm check` with Docker. Exercise the transition matrix, removed memberships, cross-tenant access, rollback and concurrency in API integration tests.

The local Orders API base URL is
`http://localhost:3000/api/organisations/:organisationId/orders`.
Replace `:organisationId` with the organisation UUID and `:id` with the order UUID.
Append the query or path from the table to that base URL. Each POST command takes
no request body and returns HTTP 200 with the updated order detail and ordered history.

| Method and relative URL | Access and behaviour |
| --- | --- |
| `GET ?status=pending` | An active manager lists the organisation's pending orders |
| `POST /:id/approve` | Pending order, active manager |
| `POST /:id/reject` | Pending order, active manager |
| `POST /:id/fulfil` | Approved order, active salesperson who submitted it |

Commands return HTTP 403 for an active member with the wrong role, HTTP 404
when membership or the scoped order is unavailable, and HTTP 409 when the
order is visible to the authorised actor but its status no longer allows the command.

### 3. Build the order entry and approval workflows in React

[Issue #58](https://github.com/MingxuanHu/ai-sales-operations/issues/58) · [PR #65](https://github.com/MingxuanHu/ai-sales-operations/pull/65)

- **Goal.** Let salespeople and managers complete the order lifecycle from the protected app.
- **In scope.** Add salesperson entry, order list and details, manager pending queue and decision controls, fulfilment and readable audit history. Clear tenant-specific state on organisation switch and handle stale lifecycle responses.
- **Out of scope.** GraphQL details and M7 reporting.
- **Acceptance.** Each role sees its permitted controls. Users can enter orders, see the server-calculated total and status, and resolve orders without issuing API calls manually. A slow response from a previous organisation cannot populate the current view.
- **Dependencies.** Issues 1 and 2 and the [existing organisation selection flow](../architecture/identity.md).
- **Validation.** Run `pnpm check` with Docker. Add web coverage for both roles, recoverable errors and tenant switching. Run the milestone browser acceptance flow against the running NestJS API and PostgreSQL. Use synthetic accounts, customers and products set up through the app. After Issue 3, the complete order flow must be usable through React and NestJS before Issue 4 begins. Confirm the same flow in the demo after the Issue 3 release.

### 4. Create separate demo organisations with synthetic data

[Issue #59](https://github.com/MingxuanHu/ai-sales-operations/issues/59)

- **Goal.** Give each newly registered user one ready-to-use demo organisation. Let any signed-in user create additional demo organisations from the app.
- **In scope.** Add a **Create demo organisation** button to the organisation selection flow. Each deliberate click creates a separate organisation, grants the requesting user its initial administrator membership, and populates it with a shared synthetic dataset. Use a distinguishable organisation name for each demo. Include customers, products, multi-line orders across all lifecycle states, approval decisions and order history. Preserve known fulfilled totals across reporting periods, products and customers for M7 filters, rankings and charts. Attribute fixture-generated audit events to the system and preserve normal role checks for live order actions.
- **Out of scope.** Backfilling demo organisations for existing users, adding fixtures to existing organisations, synthetic sign-in accounts, changes to staff invitations or role assignment flows, dashboard implementation, and seeding during releases.
- **Acceptance.**
  - A newly registered user gets exactly one demo organisation automatically. Repeated registration completion requests and later sign-ins do not create additional demos.
  - A user who registered before the feature launched gets a demo organisation only by using the button.
  - The button remains available after successful creation. Two deliberate clicks produce two separate demo organisations with distinguishable names and the same fixture content. Retrying the same request creates at most one organisation.
  - The selected organisation and any existing business records are untouched by demo creation. Each demo has its own tenant-scoped records and the requesting user can access it through the existing organisation selection flow.
  - Organisation creation, administrator membership and fixture writes are atomic. A failure leaves no partially populated demo, and retrying a failed attempt can complete provisioning.
- **Dependencies.** Issue #58 completes the browser order workflow first. Reuse the existing registration and organisation selection flows, authorisation rules, master-data models, and order and audit invariants. Follow the [security rules for synthetic data](../engineering/security.md).
- **Validation.** Run `pnpm check` with Docker. In the browser, verify automatic provisioning for a new registration, sign in again, and verify that a pre-existing user can create two demos and switch between them while their existing organisation data stays intact. API integration tests cover registration retries, concurrent retries of the same create request, separate create requests, rollback and recovery, tenant isolation, system audit attribution, and expected M7 totals.

#### Demo dataset for M7

Fern & Finch Supply is a fictional café-supply wholesaler. Each demo has five customers,
six products and 24 orders with two or three line items each. The fixtures use the same
quantities, prices and discounts across demos. Timestamps are anchored to organisation
creation and kept as historical dates after provisioning.

| Fixture check | Expected result |
| --- | --- |
| Order states | 20 fulfilled, 2 pending, 1 approved, 1 rejected |
| Fulfilled net sales | $8,502.18 across eight seven-day periods |
| Net sales by seven-day period, newest first | $1,416.36, $1,086.72, $1,716.50, $1,146.03, $599.10, $1,278.03, $658.58, $600.86 |
| Highest net sales by customer | Fern Lane Café at $2,515.81 |
| Highest unit volume by product | 90 mm cup lids at 79 cases |

Cases are the order quantity unit. M7 can filter by fulfilment timestamp and allocate
the stored order discount across products. The three fulfilled orders with discounts
above 10% have a manual approval in their system-generated history. The approved,
pending and rejected examples are excluded from sales totals.

First verified sign-in provisions the application user and demo in one transaction.
Existing application users can create one through **Create demo organisation** in the
workspace navigation. That action uses `POST /api/organisations/demo` with
`{ requestId }` and returns the new picker entry. Reusing a successful request ID
returns the same entry. System-generated orders have a null submitter and null audit
actors. Live commands continue to require real tenant memberships and the applicable
roles.
