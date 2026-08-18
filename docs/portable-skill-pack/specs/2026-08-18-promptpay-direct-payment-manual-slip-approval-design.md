# PromptPay Direct Payment + Manual Slip Approval

## Status

Approved design for implementation planning. This document is a codebase-aware
specification for adding a third credit top-up payment option to SmartAIHub.

Date: 2026-08-18

## 1. Objective

Add `PromptPay Direct Payment + Manual Slip Approval` as an additional credit
top-up method alongside the existing Beam PromptPay and Beam Card methods.

The customer selects an existing USD-priced credit package. The server obtains
the latest available daily USD/THB reference rate from Frankfurter, applies a
configurable commercial sell spread and FX risk buffer, creates a unique THB
amount with random satang, generates a fixed-amount PromptPay QR, and waits for
the customer to upload a transfer slip. A finance-authorized admin reviews the
slip and approves or rejects it. Credits are granted exactly once after
approval through the existing credit ledger.

No bank API, PromptPay webhook, OCR, automatic slip verification, or automatic
credit grant on upload is included in V1.

## 2. Codebase fit and current gaps

The canonical implementation boundary is the TypeScript web billing stack:

- `apps/web/drizzle/schema.ts` already has `invoices`, `payments`,
  `paymentAttempts`, `billingEffects`, `creditTransactions`, and
  `creditPackages`.
- `apps/web/server/services/billing/orchestration.ts` creates an invoice,
  payment, payment attempt, and invoice audit record.
- `apps/web/server/services/billing/businessEffects.ts` grants top-up credits
  after an invoice is paid.
- `apps/web/server/services/creditService.ts` is the authoritative balance and
  credit-ledger service; it atomically updates `users.credits` and inserts a
  ledger row with an idempotency key.
- `apps/web/server/routers/billing.ts` exposes `createTopupCheckout`; the
  current input accepts client-provided `credits` and `basePrice` and must be
  changed to accept a package identifier only.
- `apps/web/client/src/pages/Credits.tsx` currently offers the Beam checkout
  choices and must add the third method.
- `apps/web/client/src/pages/AdminBillingCenter.tsx` and
  `apps/web/server/routers/adminBilling.ts` already provide the admin billing
  settings and review/recovery surface to extend.
- `apps/web/server/services/billing/runtimeConfig.ts` persists global billing
  settings in encrypted/DB-backed `systemSettings`.

The Python Stripe payment models are not the source of truth for the current
web credit-purchase flow and must not receive a parallel PromptPay model.

The current `businessEffects.ts` reserves a `billingEffects` row before
calling `addCredits()` in a separate transaction. The new approval path must
not copy that failure mode: a failed credit grant must not leave a permanent
effect reservation that prevents recovery.

## 3. Existing and new payment methods

| Customer option | Existing/new | Settlement model |
|---|---|---|
| Beam PromptPay | Existing | Beam charge/webhook or reconciliation |
| Beam Card | Existing | Beam payment link/webhook or reconciliation |
| PromptPay Direct + manual slip | New | Customer transfer, admin review |

Add a transaction-level payment channel separate from the existing `provider`
field. The Direct method is not a Beam provider payment and must never be sent
to Beam reconciliation jobs.

Because `payments.provider` is currently non-null and defaults to `beam`, the
migration must also make the provider semantics explicit. Extend the existing
provider enum with an internal value such as `internal_manual` and persist
`provider = internal_manual` for Direct payments. Keep existing Beam rows
unchanged. Do not represent Direct payments as `beam` merely because they use
the same `payments` table; provider-status polling, webhook handling, and
reconciliation queries must filter by both provider and payment channel.

Recommended enum values:

```text
BEAM_PROMPTPAY
BEAM_CARD
PROMPTPAY_DIRECT_MANUAL
```

Existing rows must be backfilled from `providerPaymentType` before making the
new channel column non-null: `charge` maps to Beam PromptPay and
`payment_link` maps to Beam Card.

## 4. Commercial and FX rules

### 4.1 Source of truth

The package catalog remains USD-based. The client sends only `packageId` and
the selected payment channel. The server loads the active package and uses its
stored `credits` and `priceUsd`; client-supplied amount, credits, currency, or
FX values are ignored/rejected.

### 4.2 Daily reference rate

For V1, the primary source is the Frankfurter v2 single-pair endpoint:

```text
GET https://api.frankfurter.dev/v2/rate/USD/THB
```

Frankfurter provides the latest available daily rate and does not require an
API key. This is a daily reference rate, not an intraday executable bank quote;
the returned `date` is the rate date and must be treated as part of the pricing
snapshot. A rate fetched at order creation is valid only for that order and is
never silently re-priced later.

The FX integration must be an adapter with `FrankfurterDailyRateProvider` as
the V1 implementation. Keep the endpoint server-side and allowlisted; do not
accept an arbitrary URL from Admin settings, to avoid SSRF. The adapter must
validate HTTP status, JSON shape, `base === USD`, `quote === THB`, finite
positive rate, supported date, and response latency. It must record both the
provider's rate date and the server fetch timestamp.

Because daily reference data can be unavailable on weekends or holidays, V1
allows a configured maximum rate age (default 72 hours). If the provider is
unavailable, malformed, older than the configured maximum, or outside the
configured sanity bound, Direct order creation fails closed with a retryable
error. It must not silently use a fixed table or an unbounded old cache.

The Bank of Thailand Exchange Rates API may be used for monitoring and sanity
comparison only. It is not an automatic fallback price in V1. A future
intraday provider can replace Frankfurter through the adapter without changing
payment, invoice, or ledger models.

### 4.3 Daily rate adjustment, risk buffer, and rounding

Use separate values for commercial margin and FX-loss protection. The sell
spread is the deliberate price difference between the reference rate and the
customer-facing rate. The FX risk buffer compensates for rate movement between
order creation, customer transfer, manual approval, and eventual settlement.
Neither value guarantees zero loss; the configured values must be reviewed
against observed transfer-to-settlement timing and volatility.

The server records every input and intermediate result, then locks the final
THB amount into the invoice/payment. Use this formula:

```text
referenceThb = priceUsd * dailyUsdToThbRate
commercialThb = referenceThb * (1 + sellSpreadBps / 10_000)
riskAdjustedThb = commercialThb * (1 + fxRiskBufferBps / 10_000)
taxedThb = applyExistingTaxPolicy(riskAdjustedThb)
roundedBaseThb = ceil(taxedThb / roundingUnitThb) * roundingUnitThb
randomSatang = cryptographicallySecureRandomInteger(0, 99)
finalAmountThb = roundedBaseThb + (randomSatang / 100)
```

V1 defaults proposed for admin configuration:

- `sellSpreadBps = 200` (2.00%), adjustable without a code deployment;
- `fxRiskBufferBps = 300` (3.00%), adjustable without a code deployment;
- `roundingUnitThb = 1.00`;
- final amount formatted and stored with exactly two decimal places;
- the random value is generated on the server with a CSPRNG such as
  Node.js `crypto.randomInt(0, 100)`, never `Math.random()`.

The combined adjustment is multiplicative, not an accidental double-counting
of one percentage. With the proposed defaults, the effective rate is
`dailyRate × 1.02 × 1.03`, approximately a 5.06% uplift before tax and whole
THB rounding. Admin must see the individual percentages and the resulting
effective rate in the configuration preview.

Example with a USD 10.00 package and a daily rate of 33.041 THB/USD:

```text
referenceThb   = 10.00 × 33.041                 = 330.4100 THB
commercialThb  = 330.4100 × 1.02                = 337.0182 THB
riskAdjustedThb= 337.0182 × 1.03                = 347.1287 THB
roundedBaseThb = ceil(347.1287)                  = 348.00 THB
finalAmountThb = 348.00 + randomSatang / 100.00 = 348.xx THB
```

The example is illustrative; the actual daily rate, configured percentages,
tax policy, and generated satang are always persisted per payment.

The displayed package price remains USD. The Direct payment screen shows the
daily reference rate, rate date, server fetch timestamp, applied sell spread,
applied risk buffer, quoted THB amount, and a short explanation that the THB
amount is fixed for this order. A later FX movement never changes an issued
invoice.

### 4.4 Random-satang uniqueness

The random satang value is globally unique for all Direct payments in the same
`Asia/Bangkok` business day and for all still-reserved payments that are about
to be transferred, regardless of package or whole-THB amount.

This is intentionally a strict capacity rule: there are only 100 possible
values (`00` through `99`), so at most 100 Direct payments can consume unique
satang values in one Bangkok business day. When the pool is exhausted, order
creation must fail with a clear `PROMPTPAY_SATANG_POOL_EXHAUSTED` error rather
than reuse a value.

Allocation requirements:

1. Generate a candidate with a CSPRNG.
2. Reserve it in the same database transaction as the Direct payment.
3. Enforce uniqueness with database constraints, not an application-only
   pre-check.
4. Retry a bounded number of times after a uniqueness conflict.
5. Keep a reservation while the order is pending payment or manual review,
   including across midnight, so an imminent transfer cannot collide with a
   new order.
6. On approval, mark the reservation consumed. On cancellation or expiration
   before payment/review completion, release it. On rejection, keep the same
   amount and reservation so the customer can upload a replacement slip.

Every customer-facing representation must use the exact same `finalAmountThb`:
invoice, QR payload, payment page, upload instructions, admin review screen,
and approval comparison.

## 5. Data model and migration

### 5.1 Extend `payments`

Add a transaction payment channel and immutable Direct pricing snapshots. The
implementation may use project naming conventions, but must provide:

```text
payment_channel
source_amount_usd
source_currency              -- USD
fx_rate                      -- USD -> THB, sufficient precision
fx_provider                  -- frankfurter in V1
fx_rate_date                 -- provider's daily rate date
fx_fetched_at                -- server timestamp
fx_sell_spread_bps
fx_risk_buffer_bps
fx_effective_rate            -- after spread and risk buffer
rounded_base_amount_thb
random_satang
promptpay_amount_thb         -- exact final amount; mirrors payments.amount
promptpay_recipient_snapshot_json
```

`payments.amount` and `payments.expectedAmount` remain the authoritative
settlement amount in THB. The snapshot fields are immutable after payment
creation except for a controlled recovery/audit migration.

### 5.2 Add `payment_slips`

Create a dedicated table to preserve every uploaded slip instead of replacing
the prior file:

```text
id
payment_id                      FK payments.id
invoice_id                      FK invoices.id
user_id                         FK users.id
tenant_id                       nullable tenant scope
storage_key
original_file_name
mime_type
file_size_bytes
checksum_sha256
status                          submitted | rejected | accepted | superseded
customer_note                   nullable
rejection_reason                nullable
uploaded_at
reviewed_at
reviewed_by
created_at
updated_at
```

Indexes must support `(payment_id, uploaded_at desc)`, `(status, uploaded_at)`
for the admin queue, and duplicate-hash investigation. The same hash may be a
warning but must not automatically reject a payment.

### 5.3 Add `promptpay_amount_reservations`

Use a separate reservation table to enforce both same-day historical
uniqueness and cross-day active-order uniqueness:

```text
id
payment_id                      UNIQUE FK payments.id
business_date_bangkok           DATE
random_satang                   SMALLINT CHECK 0 <= value <= 99
state                           reserved | consumed | released
reserved_at
consumed_at
released_at
created_at
updated_at
```

Required database constraints:

- unique `(business_date_bangkok, random_satang)` while state is `reserved` or
  `consumed`;
- unique `random_satang` while state is `reserved`;
- unique `payment_id`.

The first constraint prevents same-day reuse even after approval. The second
prevents a still-pending order from colliding with a new order after midnight.

### 5.4 Snapshot and ledger integration

Keep package/credit snapshot data in the existing invoice line-item metadata,
but include both the USD package values and the final THB pricing snapshot.
The credit grant must continue through `creditTransactions` and
`CreditService`; Direct payment code must never update `users.credits`
directly.

## 6. Admin settings

Add a `PromptPay Direct` section to the existing admin billing settings surface
and persist settings through the existing `billing_runtime` setting mechanism.
The setting scope is platform-wide because `systemSettings` is currently
platform-wide; tenant-specific settlement accounts require a separate future
decision.

Required settings:

```text
PROMPTPAY_DIRECT_ENABLED
PROMPTPAY_DIRECT_RECIPIENT_ID
PROMPTPAY_DIRECT_RECIPIENT_TYPE       phone | national_id | tax_id | ewallet
PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME
PROMPTPAY_DIRECT_ORDER_EXPIRY_MINUTES
PROMPTPAY_DIRECT_FX_PROVIDER           frankfurter_daily in V1
PROMPTPAY_DIRECT_FX_MAX_RATE_AGE_HOURS  default 72
PROMPTPAY_DIRECT_FX_SELL_SPREAD_BPS    default 200 (2.00%)
PROMPTPAY_DIRECT_FX_RISK_BUFFER_BPS    default 300 (3.00%)
PROMPTPAY_DIRECT_FX_ROUNDING_UNIT_THB  fixed 1.00 in V1
PROMPTPAY_DIRECT_FX_SANITY_MIN_RATE
PROMPTPAY_DIRECT_FX_SANITY_MAX_RATE
PROMPTPAY_DIRECT_SLIP_MAX_BYTES
PROMPTPAY_DIRECT_SLIP_ALLOWED_TYPES
```

The Frankfurter endpoint is a server-side fixed allowlist value, not a free-form
Admin URL. Frankfurter does not need credentials in V1. Keep optional encrypted
provider account/key settings only for a future provider adapter; they must not
be required to enable the Frankfurter implementation.

The admin UI must show configuration health without revealing secrets. Saving
recipient or FX credentials must create a billing audit record. Direct payment
creation is disabled unless the feature, recipient, and FX configuration pass
validation. The configuration preview must show the daily rate source, sample
rate date, sell spread, risk buffer, effective-rate formula, and the resulting
adjusted rate without exposing private credentials.

Configuration validation must reject negative or non-integer basis-point
values, reject a maximum-age value that is zero or unreasonably large, and
reject sanity bounds where `minRate >= maxRate`. V1 must cap the sell spread
and risk buffer at an application-defined safe maximum and require an explicit
admin confirmation when changing either value. `roundingUnitThb` is fixed at
`1.00` for V1; supporting another unit requires a separate pricing/QR review.

## 7. PromptPay QR generation

Implement a small `PromptPayQrService` behind the web backend. It must:

- normalize and validate the configured recipient identifier;
- build a Thai QR / PromptPay payload with the exact final THB amount;
- return the payload and a renderable QR representation;
- be covered by amount/recipient regression tests;
- avoid permanently storing generated QR images.

The QR must never use the pre-rounded amount, USD amount, or a client-provided
amount. The implementation must follow a vetted Thai QR/PromptPay library or a
standards-tested implementation.

## 8. User API and UI

### 8.1 Create top-up

Change the shared top-up contract to conceptually:

```text
billing.createTopupCheckout({
  packageId,
  paymentChannel: "beam_promptpay" | "beam_card" | "promptpay_direct_manual"
})
```

For Beam methods, preserve current behavior while moving package/price/credit
resolution to the server. For Direct, return the invoice/payment identifier,
order number, exact THB amount, QR payload/URL, recipient display name, daily
rate date, server fetch timestamp, sell spread, risk buffer, effective rate,
and expiry.

### 8.2 Slip operations

Add owner-scoped operations equivalent to:

```text
getPromptPayDirectPayment(paymentId or invoiceId)
listPromptPayDirectPayments(filters)
uploadPromptPaySlip(paymentId, file)
getPromptPaySlipAccess(paymentId, slipId)
```

The upload operation must allow only the owner of an eligible payment. It must
validate actual file content, not only the extension or client MIME:

- JPEG, PNG, WebP, and PDF in V1;
- maximum 10 MiB by default, configurable;
- magic-byte/content validation;
- SHA-256 checksum;
- randomized private storage key;
- no permanent public URL.

The existing storage primitives and short-lived signed-access pattern used by
billing recovery evidence should be reused, with owner authorization added for
customer access.

### 8.3 User states

- Before slip: show QR, recipient, exact amount, expiry, and upload action.
- After upload: show `Waiting for manual review`; do not add credits.
- After rejection: show only the customer-facing rejection reason and allow a
  replacement slip using the same locked amount.
- After approval: show exact credits added, confirmation time, and updated
  balance.
- Completed or canceled payments cannot accept further slips.

## 9. Admin review and approval

Add a Direct-payment review view to `AdminBillingCenter` with queue filters for
`manual_review_required`, submitted date, order number, email, amount, and
payment channel. The detail view must show:

- user and tenant scope;
- invoice/order number;
- USD source price and final THB amount;
- FX provider/rate date/fetched-at, sell spread, effective rate, and risk buffer;
- random satang and Bangkok business date;
- latest slip and slip history;
- prior rejection reason and audit history;
- existing credit ledger effect, if any.

Use separate server-authorized operations:

```text
listPromptPayReviewQueue
getPromptPayReview
approvePromptPayPayment
rejectPromptPayPayment
```

Add billing authorization actions for viewing, approving, and rejecting Direct
payments. Finance/admin roles may approve or reject; support-view roles may
view only. An admin must not approve their own payment.

### 9.1 Approval transaction

Approval must use one database transaction with a payment row lock and the
following order:

1. Load and lock the payment, invoice, current submitted slip, reservation,
   and user balance row.
2. Verify the actor has approval permission and the payment belongs to the
   actor's tenant scope.
3. Verify the channel is Direct, status is `manual_review_required`, and the
   latest slip is submitted.
4. If already approved, return the existing idempotent completion result; do
   not add credits again.
5. Insert exactly one `billingEffects` grant record using a unique key such as
   `grant_credits:invoice:<invoiceId>`.
6. Insert exactly one purchase credit ledger row with a deterministic
   idempotency key such as `credit_purchase:invoice:<invoiceId>` and update the
   user balance in the same transaction.
7. Mark the slip `accepted`, reservation `consumed`, payment `paid`, invoice
   `paid`, and payment business effect `applied`.
8. Insert immutable invoice/payment audit records containing actor, previous
   state, new state, reason, and slip reference.
9. Commit all changes together.

If any step fails, all financial and state changes roll back. A retry after a
client timeout must return the committed result, not create a second ledger
row.

### 9.2 Rejection transaction

For a submitted Direct payment, rejection must atomically:

- mark the latest slip `rejected` with a required customer-facing reason;
- keep the payment/invoice payable and the reservation unchanged;
- write an audit record;
- allow a new slip only after rejection.

No credit ledger row is created on rejection.

## 10. State model and scheduled jobs

Map the rough specification's states onto the current billing model:

| Business state | Current model representation |
|---|---|
| Pending payment | invoice `payment_pending`, payment `payment_pending`, no submitted slip |
| Waiting for review | payment `manual_review_required`, latest slip `submitted` |
| Rejected | payment returns to `payment_pending`, latest slip `rejected` |
| Completed | invoice `paid`, payment `paid`, slip `accepted`, effect `applied` |
| Expired | invoice `expired`, payment `expired`, reservation `released` |
| Canceled | invoice `canceled`, payment `canceled`, reservation `released` |

Existing Beam reconciliation and provider status jobs must explicitly exclude
`PROMPTPAY_DIRECT_MANUAL`. Direct payments with a submitted slip must not be
expired by the unpaid-order job. Only Direct payments without a submitted slip
may transition to expired after the configured deadline.

## 11. Security, privacy, and abuse controls

- Resolve package, price, credits, FX, amount, status, and recipient entirely
  server-side.
- Enforce user ownership and tenant scope on every order/slip read or write.
- Store slips privately and serve only short-lived signed URLs after an ACL
  check.
- Sanitize filenames and use random storage keys.
- Never log FX API keys, PromptPay credentials, raw slip bytes, or full private
  URLs.
- Rate-limit order creation, slip upload, and admin approve/reject actions.
- Detect repeated SHA-256 slip hashes and show an admin warning; do not
  auto-reject based only on hash.
- Make approve/reject buttons idempotent in the UI, but rely on DB locks and
  unique constraints for correctness.
- Retain financial ledger and audit records; define an explicit slip-retention
  policy before production rollout.

## 12. Error contract

Use stable application errors, including:

```text
PROMPTPAY_DIRECT_DISABLED
PROMPTPAY_DIRECT_NOT_CONFIGURED
FX_QUOTE_UNAVAILABLE
FX_QUOTE_STALE
FX_PROVIDER_RESPONSE_INVALID
FX_RATE_OUT_OF_BOUNDS
PROMPTPAY_SATANG_POOL_EXHAUSTED
PAYMENT_PACKAGE_NOT_AVAILABLE
PAYMENT_NOT_OWNED
PAYMENT_NOT_FOUND
PAYMENT_EXPIRED
INVALID_SLIP_FILE
SLIP_TOO_LARGE
SLIP_REQUIRED
INVALID_PAYMENT_STATE
PAYMENT_ALREADY_COMPLETED
PAYMENT_APPROVAL_NOT_ALLOWED
CREDIT_GRANT_CONFLICT
```

Do not expose provider stack traces or secret/configuration values to users.

## 13. Test plan

### Unit tests

- server ignores client-provided price/credits and loads package from DB;
- Frankfurter response parsing, USD/THB pair validation, rate-date handling,
  and maximum-age enforcement;
- daily-rate formula, sell spread, FX risk buffer, tax, whole-THB rounding, and
  exact two-decimal formatting;
- effective-rate calculation is multiplicative and preserves both adjustment
  components in the snapshot;
- CSPRNG satang is within `00–99`;
- same Bangkok day cannot reuse a consumed satang;
- an active reservation blocks the same satang after midnight;
- released reservations become reusable according to the defined state;
- the 101st same-day allocation fails with pool-exhausted error;
- provider outage, malformed response, stale daily rate, unsupported rate date,
  and out-of-bound FX quote fail closed;
- QR payload contains exact final amount and configured recipient;
- valid/invalid/malformed/oversized slip handling;
- owner and tenant authorization boundaries;
- all allowed and disallowed state transitions.

### Integration tests

1. USD package → Frankfurter daily-rate fixture → sell spread → FX risk buffer
   → random satang → invoice/payment snapshot → QR.
2. Upload slip → waiting review → admin reject → replacement slip → approve.
3. Approve → one ledger transaction → balance increase → paid states → audit.
4. Two concurrent approvals → one credit grant and one consumed reservation.
5. Payment creation with a tampered amount/credits payload → server uses package
   values.
6. Direct payment is ignored by Beam reconciliation.
7. Frankfurter outage, stale daily response, invalid pair, or out-of-bound rate
   → no order is issued.
8. 100 same-day satang allocations → 101st request is rejected cleanly.

### E2E/manual QA

- scan QR with supported Thai banking applications and verify recipient and
  exact amount;
- verify mobile upload and signed slip preview;
- verify desktop/tablet/mobile admin review states;
- run one low-value real transaction before general availability;
- verify bank statement matching using the unique satang value.

## 14. Rollout and operations

1. Add schema and settings with the feature disabled.
2. Configure and test Frankfurter daily-rate provider, PromptPay recipient, sell
   spread, FX risk buffer, and expiry.
3. Test QR generation and storage in a non-production environment.
4. Enable for internal admins and one low-volume test cohort.
5. Run a real low-value transfer and verify the complete review/ledger path.
6. Expand gradually while monitoring:
   - Direct orders created;
   - FX quote failures/staleness/out-of-bound responses;
   - daily rate date versus server fetch time;
   - sell spread, risk buffer, and effective-rate distribution;
   - satang pool utilization and exhaustion;
   - slips waiting/rejected/approved;
   - approval latency;
   - duplicate-hash warnings;
   - credit grant conflicts and recovery cases.

The daily satang capacity must be visible to admins. If this method is expected
to exceed 100 payments per Bangkok day, this design must be revisited before
launch; increasing the random range alone would be a contract change requiring
QR, UI, uniqueness, and reconciliation updates.

## 15. Acceptance criteria

- [ ] PromptPay Direct appears as a third top-up method when enabled.
- [ ] Admin can configure and validate recipient, display name, Frankfurter
      daily-rate provider, sell spread, risk buffer, expiry, and slip policy.
- [ ] Client cannot set package price, credits, FX rate, random satang, or THB
      amount.
- [ ] Server converts stored USD price using an accepted latest daily FX rate.
- [ ] Rate date, server fetch time, sell spread, FX risk buffer, and effective
      rate are stored as immutable pricing snapshots.
- [ ] Sell spread, risk buffer, and tax policy are applied before whole-THB
      rounding.
- [ ] Final amount is whole THB plus cryptographically random `00–99` satang.
- [ ] Satang is globally unique for the Bangkok business day and all active
      reservations; capacity exhaustion is handled explicitly.
- [ ] The exact final amount is used by invoice, QR, UI, slip review, and
      approval.
- [ ] USD amount, FX rate/provider/time, buffer, rounding, and random satang
      are immutable snapshots.
- [ ] Slips are private, validated by content, hashed, and retained as history.
- [ ] Upload does not grant credits.
- [ ] Finance-authorized admin can approve/reject with tenant-safe ACLs.
- [ ] Approval adds the exact snapshotted credits once and only once.
- [ ] Approval is safe under retries, double-clicks, timeouts, and concurrent
      admins.
- [ ] Credit ledger, balance, payment/invoice state, reservation, and audit are
      transactionally consistent.
- [ ] Beam reconciliation does not process Direct payments.
- [ ] Focused automated tests and a low-value real transfer pass before GA.

## 16. References

- Thai PromptPay/Thai QR references from the original rough specification:
  [Bank of Thailand PromptPay](https://www.bot.or.th/th/financial-innovation/digital-finance/digital-payment/promptpay.html)
  and [Thai QR Code policy/specification PDF](https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2562/ThaiPDF/25620084.pdf).
- [Bank of Thailand Exchange Rates API](https://portal.api.bot.or.th/portal/catalogue-products/exchange-rates-1)
  for monitoring and sanity comparison only, not as an automatic stale-rate
  fallback.
- [Frankfurter API documentation](https://frankfurter.dev/), including the V2
  single-pair endpoint used by V1:
  `https://api.frankfurter.dev/v2/rate/USD/THB`.
- [ECB reference-rate guidance](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
  for the distinction between daily reference rates and executable transaction
  rates.
