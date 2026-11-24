# M06 - 01 — Orders & approvals

**Goal.** A salesperson can submit a synthetic order, a manager can decide whether to approve an above-threshold discount, and the salesperson can fulfil an approved order. The organisation can trace each state change.

## Scope and acceptance

- **In scope.** Tenant-scoped order entry and history, a 10% order discount threshold, manager decisions, fulfilment, a transactional order audit trail and a repeatable, full synthetic organisation for the M7 demo.
- **Out of scope.** Saved drafts, edits after submission, cancellation, returns, tax, shipping, inventory, payments, notifications, dashboards and the GraphQL order detail query.
- **Acceptance evidence.** Using synthetic staff accounts in the browser, submit orders at 10% and above 10%. Fulfil the first, approve and fulfil one pending order, and reject another. Verify each history, verify that pending and rejected orders cannot be fulfilled, and exercise an organisation switch. API integration tests demonstrate tenant isolation, role enforcement, money calculations, retry handling and competing transitions.

### Proposed business rules

- An active salesperson submits an order for one customer with at least one line item, positive whole quantities and a single order-wide discount from 0% to 100% with up to two decimal places. The server resolves customer and product IDs within the organisation, snapshots the customer name and product SKU, name and unit price, and calculates the subtotal and discounted total using exact arithmetic. Apply the discount to the subtotal and round the final total to cents, with half cents rounded up. Preserve order history through later catalogue changes and deletions.
- Submission at or below 10% creates an approved order. Submission above 10% creates a pending order. An active manager can approve or reject a pending order. The submitting salesperson can fulfil their own approved order. Fulfilled and rejected orders are terminal.
- Salespeople can read their own orders and use limited customer and product selectors for entry. Managers can read all orders in their organisation and filter for pending decisions. Administrators retain their existing master-data permissions. Apply current membership and tenant checks on the server, including when resolving referenced records.
- Record submission, automatic or manual approval, rejection and fulfilment with the applicable actor, timestamp and state change. Write history and state together. A repeated submission with the same request key and payload returns the original order. Competing decisions or fulfilment attempts must produce at most one transition and audit event for that step.
- For M7, count fulfilled orders only. Attribute sales to the fulfilment timestamp. Net sales sum stored discounted totals, and product net sales allocate each order's discount across its lines so allocated cents reconcile to the stored order total. M7 owns reporting and the allocation implementation.

## Issues / PRs

**Kickoff complete.** The approved breakdown is tracked in the [M6 — Orders & approvals GitHub milestone](https://github.com/MingxuanHu/ai-sales-operations/milestone/6). Follow the [delivery workflow](../engineering/delivery.md#issue-implementation) for implementation.

### 1. Add tenant-scoped order submission and read APIs

[Issue #56](https://github.com/MingxuanHu/ai-sales-operations/issues/56)

- **Goal.** Persist valid orders and the submission decision using organisation master data.
- **In scope.** Add the Prisma migration, order and line snapshots, audit storage, limited selectors, scoped list and detail reads, and idempotent submission. Apply the discount rule at submission.
- **Out of scope.** Manual decisions, fulfilment and React screens.
- **Acceptance.** Orders at 10% are approved and orders at 10.01% are pending. Invalid quantities and discounts fail with actionable errors. Foreign IDs cannot be read or used to submit. Price edits and master-data deletions preserve prior order details. Identical concurrent submissions converge on one order and one history, and reuse of a key for different input returns a conflict.
- **Dependencies.** [M5 master data](M05-01-master-data.md) and the [identity and tenant authorisation rules](../architecture/identity.md).
- **Validation.** Run `pnpm check` with Docker. Cover role and tenant scope, rounding and threshold boundaries, historical snapshots and concurrent retries in automated tests.

### 2. Add manager decisions and fulfilment APIs

[Issue #57](https://github.com/MingxuanHu/ai-sales-operations/issues/57)

- **Goal.** Enforce manual approval, rejection and fulfilment with a complete history.
- **In scope.** Add decision and fulfilment commands using the existing organisation transaction policy. Expose the recorded history through the scoped order detail API.
- **Out of scope.** Reopening, cancellation and browser controls.
- **Acceptance.** Only managers decide pending orders. Only the submitting salesperson fulfils an approved order. Stale or conflicting transitions return a conflict and leave history unchanged. Concurrent actions yield one recorded transition, and a failed audit write rolls back the state change.
- **Dependencies.** Issue 1 and the [identity mutation policy](../architecture/identity.md).
- **Validation.** Run `pnpm check` with Docker. Exercise the transition matrix, removed memberships, cross-tenant access, rollback and concurrency in API integration tests.

### 3. Build the order entry and approval workflows in React

[Issue #58](https://github.com/MingxuanHu/ai-sales-operations/issues/58)

- **Goal.** Let salespeople and managers complete the order lifecycle from the protected app.
- **In scope.** Add salesperson entry, order list and details, manager pending queue and decision controls, fulfilment and readable audit history. Clear tenant-specific state on organisation switch and handle stale lifecycle responses.
- **Out of scope.** GraphQL details and M7 reporting.
- **Acceptance.** Each role sees its permitted controls. Users can enter orders, see the server-calculated total and status, and resolve orders without issuing API calls manually. A slow response from a previous organisation cannot populate the current view.
- **Dependencies.** Issues 1 and 2 and the [existing organisation selection flow](../architecture/identity.md).
- **Validation.** Run `pnpm check` with Docker. Add web coverage for both roles, recoverable errors and tenant switching. Run the milestone browser acceptance flow against the running NestJS API and PostgreSQL. Use synthetic accounts, customers and products set up through the app. After Issue 3, the complete order flow must be usable through React and NestJS before Issue 4 begins. Confirm the same flow in the demo after the Issue 3 release.

### 4. Provision a complete synthetic organisation for the M7 demo

[Issue #59](https://github.com/MingxuanHu/ai-sales-operations/issues/59)

- **Goal.** Give the developer a repeatable provisioning command that creates a sign-in-capable synthetic organisation locally and in the authorised demo environment, with enough history to demonstrate M7.
- **In scope.** Provision a synthetic administrator and supporting salesperson and manager identities in the target environment's Cognito pool. Create a synthetic wholesale company through the existing organisation model, with memberships, representative invitation states, customers, products and multi-line orders across all lifecycle states. Include approval decisions and audit history. Document how to run provisioning, sign in, and verify the fixture.
- **Out of scope.** Dashboard implementation, public provisioning endpoints, real customer data, and automatic fixture writes during application releases. Running against the shared demo requires explicit developer authorisation.
- **Acceptance.** A developer can provision the fixture and sign in with its synthetic identities using the existing app. Known fulfilled totals across several reporting periods, products and customers support verification of M7 date filters, rankings and charts. Pending, approved but unfulfilled, and rejected orders exercise exclusions. Re-running provisioning reconciles fixture records without duplicating them or modifying unrelated data. The command scopes writes to the intended environment and fixture, preserves order and audit invariants, and keeps credentials out of source and logs.
- **Dependencies.** Issue 3 completes the browser workflow first. Reuse the existing identity and master-data models and the order and audit rules from Issues 1 and 2. Follow the [security rules for synthetic data](../engineering/security.md).
- **Validation.** Run `pnpm check` with Docker. Provision twice in a disposable local environment and verify sign-in, role access, fixture counts, histories, tenant boundaries and expected M7 totals. Verify demo provisioning and sign-in after authorisation.
