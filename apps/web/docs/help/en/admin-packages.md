---
slug: admin-packages
title: Credit Packages & Pricing
description: Create and manage credit packages and subscription plans
icon: Package
section: admin
order: 87
pages: ["/admin/packages"]
tags:
  - "admin"
  - "packages"
  - "credits"
  - "pricing"
  - "subscription"
  - "billing"
  - "stripe"
  - "plans"
  - "help"
  - "help/en"
  - "help/admin"
  - "admin-packages"
aliases:
  - "admin-packages"
  - "Credit Packages & Pricing"
  - "Credit Packages & Pricing help"
---

# Credit Packages & Pricing

## Overview

Credit Packages lets administrators create and manage the pricing tiers available to users. Support for one-time credit purchases and recurring subscriptions with Stripe integration.

## Creating a package

1. Click **New Package**.
2. Fill in the details:
   - **Name** — display name (e.g., "Starter", "Pro", "Enterprise").
   - **Credits** — number of credits included.
   - **Price** — amount in your configured currency.
   - **Billing period** — one-time, monthly, quarterly, semi-annual, or yearly.
3. Optionally set a **Stripe Price ID** for payment processing.
4. Click **Save**.

## Package types

| Type | Description |
|------|-------------|
| One-time | User pays once, receives credits immediately |
| Monthly | Recurring subscription, credits refresh each month |
| Quarterly | Recurring every 3 months |
| Semi-annual | Recurring every 6 months |
| Yearly | Recurring annually (usually discounted) |

## Managing packages

- **Reorder** — drag packages to set display order on the pricing page.
- **Feature** — mark one package as "featured" to highlight it (shows a badge).
- **Edit** — modify name, price, or credit amount.
- **Disable** — hide a package from new purchases (existing subscribers keep their plan).

## Stripe integration

Each package can be linked to a Stripe Price ID:

1. Create the product and price in your Stripe dashboard.
2. Copy the Price ID (starts with `price_`).
3. Paste it into the **Stripe Price ID** field.

The system uses this ID to create checkout sessions and manage subscriptions.

## Tips

- Offer at least 3 tiers (basic, standard, premium) for effective pricing strategy.
- Use yearly billing with a discount to encourage longer commitments.
- Feature the mid-tier package — it typically converts best.
- Test checkout flow after creating or modifying packages.

<!-- knowledge-graph:related:start -->
## Related Help

- [[admin-advanced|Advanced Administration]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[admin-agencies|Agency Management]]
- [[admin-alert-rules|Alert Rules & Escalation]]
- [[admin-approvals|Approvals]]
- [[admin-audit|Audit Logs]]
<!-- knowledge-graph:related:end -->
