# Product vision

## Users and problem

Small B2B wholesalers need one place to manage customers, products, orders, approvals and sales results. Staff also need to interpret order policies and ask questions about sales data without navigating multiple reports.

## Core workflow

1. A company administrator manages staff, customers and products.
2. Sales staff create orders with line items, quantities and discounts.
3. An order exceeding the example **10% discount threshold** requires manager approval; other valid orders can proceed automatically.
4. Approved orders can be marked fulfilled and appear in sales reports. Rejected orders never count as sales.

The threshold is a demonstration policy, not a claim about real wholesale practice. The exact state transitions and metric definitions are specified during M6.

## AI copilot

- **Analytics:** “Which products had the highest net sales this month?” A protected business tool calculates the figures; AI explains and visualises them.
- **Policy Q&A:** “Why is this order pending?” RAG cites the tenant's discount policy and uses authorised order data.
- **Action assistance:** “Find overdue approvals and propose follow-up tasks.” Users confirm changes; backend rules enforce permissions.

## Boundaries

Multi-tenant isolation and synthetic data only. No payments, real inventory, shipping integration, subscription billing, unrestricted SQL generation, model training or multi-agent platform in the MVP.

The SaaS must remain usable without AI.
