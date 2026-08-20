# Admin Billing Invoice Audit Details

## Goal

Make historical invoice investigation fast and reliable from the Admin Billing
page. An admin should be able to identify the customer, order, amount, payment
attempt, uploaded slip, and approval event without opening several disconnected
panels or guessing which timestamp belongs to which state transition.

## Approved UX direction

Use an enterprise-calm / luxury-refined operations surface inside the existing
Admin Billing page:

- Keep invoice search/list as the navigation surface.
- Make the selected invoice detail the authoritative investigation surface.
- Lead with a compact status-and-total summary.
- Group detail into Customer & order, Payment & slip, and Activity timeline.
- Render every invoice line item, even when the normal case has only one item.
- Use Thai-friendly local date/time formatting while retaining exact status and
  identifiers for support work.
- Keep slip files private; show safe signed previews only after an explicit
  preview action.

## Data contract

Add a dedicated `adminBilling.getInvoiceAuditDetails` query rather than
changing the existing `getInvoice` shape used by mutation preconditions. The
response contains:

- `invoice`: the canonical invoice row.
- `customer`: user id, name, and email.
- `lineItems`: all invoice line items with quantity, unit price, amount, and
  metadata-derived credit/package label when available.
- `payments`: all payment rows with sanitized provider JSON, payment status,
  expected/settled amounts, source USD amount, and nested slips.
- `auditLogs`: sanitized invoice audit rows plus actor name/email where the
  actor is a user.

The server remains the source of truth. The UI must not infer approval from a
paid badge alone: it displays the explicit slip review fields and approval
audit event when present, and an intentional empty state when they are absent.

## Slip access

The existing `getPromptPaySlipAccess` route remains the only file access path.
The audit details query returns slip metadata and IDs, not storage keys or
URLs. The UI requests a short-lived signed URL only when the admin selects a
slip preview.

## Failure and state handling

- Loading: skeleton/quiet loading state in the detail pane.
- Missing invoice: existing not-found handling remains unchanged.
- No line items: show a clear empty state rather than an empty table.
- No slips: show “ยังไม่มีสลิปที่อัปโหลด” and payment status.
- Slip rejected: show rejection reason, reviewer, and review time.
- Slip accepted: show accepted time and reviewer.
- No approval audit: show “ยังไม่มีหลักฐานการ approve” instead of implying
  approval from payment status.
- Preview failure: retain metadata and show a non-destructive preview error.

## Implementation boundaries

- Server: one read-only service query plus one protected router procedure.
- Client: selected-invoice detail section and private slip preview state.
- No schema migration and no payment-state mutation.
- Preserve the existing review queue and recovery controls.
- Keep unrelated dirty worktree changes untouched.

## Verification

- Service/router contract test covers customer email, all line items, payment
  source USD, slip metadata, and actor-enriched audit rows.
- Admin Billing page test covers the new summary, line-item rendering, payment
  and slip empty/success states, and approval timestamp copy.
- Run focused tests with jsdom for the React page, targeted TypeScript checks,
  and `git diff --check` on owned files.
- Browser-authenticated and deployment verification remain external checks and
  are reported separately if unavailable.
