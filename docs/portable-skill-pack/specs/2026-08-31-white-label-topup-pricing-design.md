# White Label eligibility for high-value top-up packages

## Goal

Make active one-time credit packages priced at **$300 or more** eligible for
White Label and Custom Domain onboarding on the public Pricing page, while
keeping purchase immediate through `/credits`. The page must clearly state that
the package price does not include domain registration, renewal, or other domain
provider charges.

## Scope and approach

- Reuse the existing `packages.list` contract and Pricing page package cards.
- Derive eligibility in the page with one named threshold constant:
  `packageType === "one_time" && priceUsd >= 300`.
- Keep qualifying packages out of the ordinary Credit Packs section so they are
  not presented twice or mistaken for ordinary top-ups.
- Keep existing `agency` packages in the White Label section with their current
  Contact Sales flow.
- Render qualifying one-time packages with a primary `Buy Now` link to
  `/credits` and a secondary `Request Custom Domain` link to `/contact`.
- Do not change the database schema, package purchase flow, credit ledger, or
  domain provisioning behavior.

## User-facing contract

- White Label eligibility means the customer may request branding and a custom
  domain after purchase; it does not activate a domain automatically.
- The White Label section includes a prominent notice:
  “Domain registration and renewal fees are not included.”
- The top-up card repeats the notice near its actions and identifies the price as
  a one-time credit purchase.
- Packages below $300 remain ordinary credit packs and retain the existing
  `Buy Now` action.

## UI/UX contract

### Target User / JTBD

- Role: business customer evaluating a high-value AI credit purchase.
- Goal: buy credits immediately and understand how to request White Label/domain
  setup without hidden domain costs.
- Entry point: public `/pricing` page.
- Success outcome: customer can distinguish eligible packages, buy credits, and
  contact sales for domain setup.

### Existing Pattern Reference

- Searched: `Pricing.tsx`, `packages.ts`, existing `agency` package section and
  `/credits`/`/contact` links.
- Found: `apps/web/client/src/pages/Pricing.tsx` already contains agency White
  Label cards and ordinary top-up cards.
- Decision: reuse the existing cards, gradients, Button, Link, and responsive
  grid patterns; diverge only in CTA/price wording for one-time White Label
  eligible packages.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Public pricing | `apps/web/client/src/pages/Pricing.tsx` | Filter, display, disclosure, CTA |
| Package API | `packages.list` | No change |
| Purchase | `/credits` | No change |
| Sales request | `/contact` | No change |

### State matrix

| State | Expected UI |
|---|---|
| Loading | Existing loading state |
| Error | Existing error state |
| No qualifying packages | White Label section remains available for agency packages; no empty promotional card |
| Success | Eligible top-ups appear once in White Label and ordinary packs exclude them |
| Disabled/focus/hover | Existing Button/Link behavior and visible focus styles remain |

### Responsive matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | Cards stack; both actions remain full-width and readable |
| tablet 768x1024 | Cards use a two-column layout where available |
| desktop 1440x900 | Existing centered max-width grid and White Label hierarchy remain |

### Accessibility acceptance

- Keep semantic section headings and visible action labels.
- Keep keyboard-reachable links/buttons with visible focus styles.
- Do not communicate eligibility or cost exclusion by color alone; use text.
- Preserve reduced-motion behavior of existing decorative animations.

### Visual direction

Reuse the existing Soft Premium blue/cyan/teal pricing vocabulary, spacing,
radii, Button variants, and card elevation. Add hierarchy through a clear badge
and disclosure copy rather than introducing new tokens or dependencies.

### Copy contract

- Primary language: existing page language (English).
- Required labels: `White Label Eligible`, `Buy Now`, `Request Custom Domain`.
- Required disclosure: `Domain registration and renewal fees are not included.`
- Required helper text: `Purchase credits now, then contact us to activate White Label branding and your custom domain.`

### Browser evidence required

Manual or Playwright evidence should cover `/pricing` at 390x844, 768x1024, and
1440x900, including qualifying/non-qualifying package placement and disclosure
visibility. If browser tooling or live package data is unavailable, report that
limitation explicitly.

## Data flow and failure handling

`packages.list` continues to return active packages. The client derives the
presentation groups deterministically. Loading/error handling is unchanged, and
missing or malformed package data cannot grant eligibility unless both the type
and numeric price satisfy the rule. No payment or provisioning side effect is
introduced by this UI change.

## Verification

- Add a focused unit test for the eligibility predicate and boundary values
  ($299.99, $300, and a subscription at $300).
- Run the focused test, `apps/web` typecheck, and `git diff --check`.
- Browser verification is separate from automated tests and must not be claimed
  unless actually run.

## Trade-offs

Client-side filtering keeps this change small and preserves the existing public
API, but it does not enforce White Label entitlement or domain provisioning.
Those remain a separate backend/onboarding concern and are intentionally out of
scope here.
