# M07 - 01 — Dashboard

**Goal.** Organisation administrators and managers can see how much their organisation sold over a selected period, how sales changed over time, and which products and customers contributed most.

## Scope and acceptance

- **In scope.** Read-only, tenant-scoped reporting for fulfilled order count, net sales, a daily net sales chart, and product and customer rankings by net sales. Show cases sold in product rankings.
- **Out of scope.** Salesperson-specific reporting, exports, forecasting, cross-organisation reporting, GraphQL order details and natural-language queries. M9 can reuse the reporting service behind its own authorised tools.
- **Acceptance evidence.** In a freshly seeded demo organisation, verify that the default 60-day range shows fulfilled orders, net sales on multiple days and multiple ranked customers and products. Reconcile the totals and rankings against the seeded fulfilled orders. Filter to a smaller range and reconcile the chart and summaries against included orders. Repeat in an empty organisation and verify that switching organisations clears the previous report.

### Reporting rules

- Include fulfilled orders by fulfilment timestamp. Interpret selected start and end dates as UTC calendar dates, with both dates included. Query from the start of the first day up to, but excluding, the start of the day after the end date. Default to the latest 60 UTC calendar days, including today, and cap a request at 366 days.
- Sum stored discounted order totals in exact cents for organisation totals, daily totals and customer rankings. Group customers and products by their stable IDs so renames preserve their historical totals. Use the organisation's current names as display labels and break ranking ties consistently by ID.
- Allocate each order's stored net cents to its lines in proportion to their stored pre-discount subtotals. Round each share down and distribute remaining cents in descending fractional-remainder order, breaking ties by line ID. A zero subtotal contributes zero net cents. Sum the allocated cents and quantities by product, including quantities from fully discounted fulfilled orders.
- Authorise active administrators and managers on the server for the requested organisation. Scope all order and related record reads to that organisation.

## Issues / PRs

**Kickoff complete.** The approved issues are tracked in the [M7 — Dashboard GitHub milestone](https://github.com/MingxuanHu/ai-sales-operations/milestone/7). Follow the [delivery workflow](../engineering/delivery.md#issue-implementation) for implementation.

### 1. Add the tenant-scoped sales reporting API

[Issue #68](https://github.com/MingxuanHu/ai-sales-operations/issues/68) · [PR #71](https://github.com/MingxuanHu/ai-sales-operations/pull/71)

- **Goal.** Expose a protected, deterministic report for a validated date range.
- **In scope.** Add the NestJS reporting service and read endpoint, daily totals with zero-filled days, and ranked product and customer results. Apply exact-cent allocation and return money as decimal strings.
- **Out of scope.** React screens, writes, exports and AI tools.
- **Acceptance.** Return accurate totals and rankings from stored orders. The daily series, customer totals and product allocations each reconcile to total net sales. Invalid and oversized ranges fail validation. Empty ranges return zero totals and empty rankings. Integration tests verify role enforcement and cross-tenant isolation.
- **Dependencies.** [M6 order and fixture rules](M06-01-orders-and-approvals.md) and [tenant authorisation](../architecture/identity.md).
- **Validation.** Run `pnpm check` with Docker. Cover cent remainders and ties, zero-subtotal and fully discounted orders, date boundaries, all order states, fixture totals, and authentication and authorisation.

### 2. Seed more fulfilled orders when creating a demo organisation

[Issue #72](https://github.com/MingxuanHu/ai-sales-operations/issues/72) · [PR #74](https://github.com/MingxuanHu/ai-sales-operations/pull/74)

- **Goal.** Give a fresh demo organisation enough sales activity to populate the dashboard on first visit.
- **In scope.** Expand the shared synthetic fixtures with more fulfilled multi-line orders across several weeks, customers and products. Anchor fulfilment dates to organisation creation. Use the expanded fixtures for automatic demos on registration and for the **Create demo organisation** button. Add ten synthetic customers and ten catalogue products, each represented in fulfilled sales. Paginate the Products, Customers and Orders list views at 10 records per page. Add search by product name or SKU, customer name, and order customer name, status or ID.
- **Out of scope.** Backfills, dashboard UI changes and reporting rule changes.
- **Acceptance.** Both creation paths produce data for the default 60-day report. Narrower ranges include only matching fulfilments, and the totals, chart and rankings reconcile to the included orders. Retrying the same creation request does not duplicate seeded data. Search filters the full list before pagination and combines with the order status filter. Pagination remains visible for single-page and empty lists. Users can navigate every page, changing the order filter returns to page one, and deleting the last record on the current page returns to the last available page.
- **Dependencies.** Issue #68 and the [M6 demo organisation rules](M06-01-orders-and-approvals.md#4-create-separate-demo-organisations-with-synthetic-data).
- **Validation.** Run `pnpm check` with Docker. Add integration coverage for both demo creation paths, request retries and report reconciliation. Cover search and pagination in the React tests.

### 3. Build the date-filtered sales dashboard in React

[Issue #69](https://github.com/MingxuanHu/ai-sales-operations/issues/69)

- **Goal.** Let authorised users inspect sales totals, trends and rankings from the protected app.
- **In scope.** Add a dashboard entry for administrators and managers, date controls with the default range, totals, an accessible daily chart with a text or table equivalent, and product and customer rankings. Handle loading, empty results and recoverable errors.
- **Out of scope.** Order detail drill-down, chart exports, and administrator configuration.
- **Acceptance.** Changing the date range updates all report sections together. The view displays the date convention and allows keyboard users to read the trend data. Switching organisations removes the previous report immediately and ignores late responses. Salespeople have no dashboard entry.
- **Dependencies.** Issues #68 and #72 and the [protected organisation selection flow](../architecture/identity.md).
- **Validation.** Run `pnpm check` with Docker and add React coverage for dates, loading, empty and error states, role visibility, and organisation switching. Verify the milestone acceptance flow in a local browser and repeat it with synthetic data in the demo after release.
