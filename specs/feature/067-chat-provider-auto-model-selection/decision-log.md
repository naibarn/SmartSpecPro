# Decision log

## Decision 1. Keep explicit model selection first-class

Status:

- accepted

Reason:

- users already rely on explicit model choice
- changing explicit behavior would risk OpenRouter regressions

Consequence:

- auto mode is additive only

## Decision 2. Provider-auto is authoritative only when explicitly selected

Status:

- accepted

Reason:

- provider-auto should be opt-in
- existing explicit `model` + `preferredProvider` requests must continue to work

Consequence:

- no reinterpretation of old requests as provider-auto

## Decision 3. Reuse existing capability-aware selection logic

Status:

- accepted

Reason:

- the repo already has selection logic in `intelligentModelSelector.ts`
- duplicating selection logic would create drift between skills and chat

Consequence:

- feature 067 adds a chat resolver layer, not a second ranking engine

## Decision 4. Provider ID is authoritative, provider name is display-only

Status:

- accepted

Reason:

- client-provided provider names can be stale or spoofed

Consequence:

- provider-auto requests must reload provider by provider ID from DB

## Decision 5. Route-family compatibility is a hard filter before ranking

Status:

- accepted

Reason:

- feature 065 already established strict Kie family guardrails
- auto mode must not choose candidates that would immediately fail downstream

Consequence:

- standard chat runs exclude responses-only models unless the run explicitly requires responses mode

## Decision 6. Trusted capability derivation is server-owned

Status:

- accepted

Reason:

- allowing raw client capability booleans would create a cost-escalation and correctness footgun

Consequence:

- clients may request allowlisted feature modes
- the server derives actual capability requirements

## Decision 7. Persist preference separately from last resolved model

Status:

- accepted

Reason:

- provider-auto and global-auto must resolve per run
- the system still needs observability and continuity

Consequence:

- conversation storage must distinguish:
  - user preference
  - last resolved model/provider/family

## Decision 8. Provider-auto must fail closed, not cross providers

Status:

- accepted

Reason:

- a user selecting `Kie AI - Auto Model` is expressing provider intent, not just capability intent

Consequence:

- no cross-provider fallback in provider-auto mode

## Decision 9. Kie behavior should be inherited, not duplicated

Status:

- accepted

Reason:

- feature 065 already contains the Kie runtime behavior

Consequence:

- feature 067 resolves the concrete provider/model and then reuses existing Kie-aware runtime code
