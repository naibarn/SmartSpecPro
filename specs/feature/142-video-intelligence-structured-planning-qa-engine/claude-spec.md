# Consolidated Specification — Feature 142 (as decided)

**Date:** 2026-08-02
**Status:** Ready for planning

This is the **synthesis document** for planning: the authoritative requirement
statement is [`spec.md`](./spec.md) v1.3.0 (1,400 lines, 18 sections, §17 Risk
Register). This file does not restate it. It records what
[`claude-research.md`](./claude-research.md) and
[`claude-interview.md`](./claude-interview.md) **changed or settled** on top of
it, so the plan can be written against one consistent picture.

---

## 1. Requirement source of truth

| Concern | Where |
|---|---|
| Goal, scope, non-duplication contract | `spec.md` §1–§2 |
| Ground truth of what already exists | `spec.md` §3, corrected by `claude-research.md` §0 |
| Data model, concurrency, lifecycle, re-run | `spec.md` §6 |
| Error codes | `spec.md` §8.1 (+ 2 new below) |
| Security, rate limits, credits, STRIDE | `spec.md` §9 |
| Performance & availability targets | `spec.md` §10 |
| Implementation detail & UI | `spec.md` §12 |
| Step sequencing | `spec.md` §13 |
| Test strategy | `spec.md` §14 + `claude-research.md` §3 (exact conventions) |
| Risk register | `spec.md` §17 |

## 2. What research changed (already folded into spec.md v1.3.0)

1. 🔴 **No double-charge.** `callLLMStructured` bills internally per attempt.
   Record `creditsUsed`; never re-bill. (`spec.md` §9.4, `claude-research.md` §0 F0-1)
2. **"No charge on failure" is scoped**, not absolute — a provider call that
   succeeds then fails schema validation is already billed.
3. **Active pointer:** key `vi:job:active:{tenantId}:{projectId}`, TTL **2 h**
   (not 1 h), **one live job per project regardless of kind**. Today's swallowed
   enqueue error therefore blocks a project for two hours.
4. `creditTransactions.traceId` is `varchar(32)` — rich context goes in `metadata`.

## 3. What the interview settled

| # | Decision | Consequence for the plan |
|---|---|---|
| **D1** | Repairs **auto-apply**, then re-review | No approval UI. The revision trail becomes the safety net — every repair round MUST append a revision row with `reason: "quality_repair"`, plus a one-click revert in the UI |
| **D2** | Use the existing **recommended-model** system | New resolver + circuit-breaker strike integration (§4 below) |
| **D3** | Implement **Steps 0–5** (~5.5 days) | Full loop in scope, including the cross-cutting rules |
| **D4** | **Estimate → confirm → run** for every LLM stage | Estimate covers the *whole loop* (`perRound × maxLoops`), because D1 makes one confirm authorise many calls. Post-run UI reports actual credits and must not imply a failed stage was free |

D1 + D4 together define the consent model: **confirm once at launch, then the
loop runs autonomously.**

## 4. Model resolution — the one genuinely new subsystem interaction

Replaces `spec.md` §8.6's placeholder "explicit model tier" wording with the
concrete mechanism.

**Selection (AD-1, AD-2, AD-3):**

```
explicit pin (user/admin, ≠ "__automatic__")
  → else selectLlmModelCandidates(
        { recommendedOnly: true, supportsStructuredOutputs: true },
        await loadEnabledLlmModelRows(), 1)
  → else THROW VI_NO_RECOMMENDED_MODEL      ← hard-fail, no silent degradation
```

Resolved id is passed as `callLLMStructured`'s **`model`** param.
`preferredProviderId` stays unset.

Rationale for not using `resolveQualityLargeContextModelId()`: its 1M-context +
`supportsThinking` + non-free floor is tuned for long Vertical Drama scripts and
would needlessly narrow 142's pool. Critically, **nothing in the existing
recommended path filters on `supportsStructuredOutputs`** — and the stated
concern is precisely weak models mangling nested JSON — so 142 adds that filter.

**Circuit-breaker feedback (AD-4):**

```ts
// ONLY on model-attributable schema failure. Never on transport/provider/credit errors.
if (error instanceof LLMStructuredOutputError) {
  void recordRecommendedModelQualityStrike({
    modelId: servedOrRequestedModelId,   // prefer result.modelId when available
    runId: traceId,
    reason: "contract_violation",
    detail: /* comma-joined zod issue paths */,
  });
}
```

6 strikes in 24 h auto-revokes `isRecommended`, but never below a pool of 1.
**There is no automatic re-promotion** — an admin must re-recommend at
`/admin/llm-models`. The plan must surface this in observability, because the
breaker itself emits only `console.warn`/`console.error` — no audit row, no metric.

**New error code:** `VI_NO_RECOMMENDED_MODEL` (BAD_REQUEST) — added to
`spec.md` §8.1's registry as part of this feature.

## 5. Consolidated risk position

`spec.md` §17 lists 14 risks (R14 fixed and deployed; the rest specified but
unbuilt) plus 5 accepted. This round implements Steps 0–5, which closes
**R1–R13**. Two additions from research and the interview:

| # | Risk | Mitigation |
|---|---|---|
| **R15** | Recommended pool empty or all-revoked → stages dead with no obvious cause | Hard-fail `VI_NO_RECOMMENDED_MODEL` + an observability signal on auto-revocation (the breaker is otherwise console-only) |
| **R16** | Auto-repair (D1) makes a document worse with no human in the loop | Per-round revision rows + one-click revert + the existing rollback rule that a repair worsening `blocksFinalRender` is reverted + bounded `maxLoops` |

## 6. Definition of done

- All three stages reach a terminal state and produce real output.
- `initVideoIntelligenceJobsQueue()` is called at startup and a wiring-guard test
  proves it.
- No `VI_*_NOT_WIRED` error remains; `NotWiredJobCard` is removed.
- Estimate → confirm → run works end-to-end; post-run actual credits shown.
- Auto-repair loop raises the score on a seeded failing document, with every
  round revertable.
- A plan that would exceed the 40-layer budget or violate timeline invariants is
  rejected **before** any write.
- No double-charge: exactly one `creditTransactions` row per LLM attempt, written
  by `callLLMStructured`, none by 142.
- Non-duplication guards compile-fail if a media-generation member is added.
- Existing suites stay green, with the two knowingly-rewritten tests in
  `videoProjectQualityLoop.test.ts` updated deliberately.
