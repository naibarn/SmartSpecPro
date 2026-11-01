# Section 03: Identity, authentication, 2FA and email

## Requirements

REQ-311-04, REQ-311-05, REQ-311-06.

## Prerequisites

section-02. Reconcile current canonical source, handoff and existing implementation before changing code.

## Touched scope

Existing auth procedures/services, cookie/session/tenant/rate-limit helpers and frontend auth bootstrap; Worker auth handlers and existing email configuration/secret bindings.

## Implementation tasks

Port auth/session/bootstrap, onboarding/invites, verification/recovery, OAuth and all applicable 2FA paths using existing identities and cryptographic contracts. Inventory password algorithm and crypto compatibility before choosing adapter changes. Preserve encrypted secrets and challenge/recovery semantics; do not repair login by disabling protections.

Prove saved email transport compatibility from Worker; choose a demonstrated compatible adapter without silently changing provider. Persist tokens and sending responsibility durably and idempotently, preserve generic public responses, and expose protected delivery diagnostics. Exercise actual authorized inbox delivery and link/code completion. Verify trusted-host cookie scope for workers.dev and production independently. Native dependency-only failures remain blocked and mapped.

## Focused verification

Existing password hashes and encrypted TOTP fixtures; valid/invalid/revoked session, logout, expiry, recovery code replay and challenge limits; OAuth state/redirects; tenant isolation; workers.dev cookie separation; generic anti-enumeration and authorized real email inbox receipt/code redemption; no double-send on retried delivery.

## Observable deliverable

Verified implementation for the mapped behavior with exact-source evidence and explicit remaining inventory/requirement gaps. Preserve every unrelated dirty change. A completed section does not close runtime acceptance without its required live proof.

## Known gaps and next action

Runtime behavior is unverified at planning time. Start by inspecting the named source and actual capability, add the scoped failing test/proof, implement the smallest compatible slice, integrate promptly, and update the existing canonical requirement handoff. Do not allocate new infrastructure or claim provider access based on a source stub.
