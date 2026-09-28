# Synthesized Specification: Prompt Expansion Quality Gap Closure

## Outcome

The Vertical Drama wizard will offer an honest, useful, profile-aware AI
treatment step backed by a real LLM execution. For a story premise, the result
is a richer editable brief that organizes the story promise and likely arc
without becoming the final Draft. It is safe to cancel, retry, edit, or apply,
and the approved result is handed to the existing Draft pipeline exactly once
with lineage and conflict protection. If real execution cannot be proven, the
operation fails and shows the reason; it never fabricates a fallback result.

## User-visible contract

The dialog must label three distinct concepts:

1. **โจทย์ต้นฉบับ** — the creator's text, unchanged and recoverable.
2. **AI treatment / โครงเรื่องที่ AI ขยาย** — editable generated structure,
   marked with assumptions, missing fields, and verification warnings.
3. **Draft เนื้อเรื่องย่อ** — the downstream series-generation result, not
   produced by this dialog.

For `story`, the treatment can contain: premise/title/one-line summary,
protagonist and co-protagonist foundations, goals/wants/needs, setting and
meeting circumstances, relationship progression, external/internal obstacles,
opposing forces and costs, central mystery or question, turning point/climax,
ending direction, unresolved hooks, tone, audience, exclusions, assumptions,
and a concise handoff prompt. The model may leave a field unknown and explain
what needs creator input; it must not fabricate explicit facts.

For `review`, `documentary`, `news_report`, and `software_review`, required
fields are selected by profile and use the existing source/evidence semantics.
News claims remain verification-gated; documentary facts and review/software
claims remain distinguishable from creative framing.

## System contract

- Add a versioned shared Zod contract and matching skill output schema.
- Use a dedicated `vertical-drama-prompt-expansion` capability with structured
  response formatting and bounded schema/quality repair. The call must require
  the exact skill, `execution_mode: llm-only`, a configured provider/model, and
  real-run evidence.
- Normalize only safe transport wrappers/fences/aliases.
- Run deterministic quality checks for original equality/near-equality,
  generic-only additions, minimum profile sections, excessive unsupported claims,
  and missing/unsafe fields.
- A successful preview must contain substantive generated content. Plain-text,
  empty, malformed, copied, generic, or incomplete output is a failed result.
  A rejected response is retryable or terminally failed; it is never silently
  converted to a successful original-prompt preview.
- Skill resolution failures, provider failures, missing real-run evidence, and
  quality-gate failures return a typed user-visible error with a sanitized
  reason and trace ID. No fallback/mock/sample output is returned.
- Preview is immutable and cancel-safe. Apply is owner/tenant scoped,
  idempotent, revision/hash fenced, and compare-and-swap protected.
- Approved treatment is persisted as a separate lineage object from the source
  prompt and is passed to the existing Draft flow as authoritative context.
- Telemetry reports outcome categories without raw prompts, raw model output, or
  secrets.
- A non-mocked integration smoke run verifies the real provider path; fixture or
  unit-test mocks are explicitly insufficient.

## Scope boundaries

In scope: shared contract, skill bundle/routing, parser/normalizer, quality
gate, bounded retry, preview/apply service and router, Draft handoff lineage,
dialog copy/edit/state behavior, tests, browser evidence, and rollout gates.

Out of scope: a new LLM provider, a second Draft generator, automatic apply,
unreviewed factual/media ownership claims, unrelated source-pack redesign, and
deployment activation.

## Acceptance

- A representative Thai story premise produces a visibly richer editable
  treatment with story-specific sections, not just the original plus generic
  instructions.
- Original and generated text are visibly distinct; a failed AI call cannot be
  displayed as a successful expansion.
- Malformed, copied, generic, and incomplete outputs have deterministic failed
  status, clear reason, retry/cancel behavior, and no data loss; no fallback
  treatment is shown.
- Non-story profiles do not receive romance/character-arc requirements by
  accident.
- Apply rejects stale hash/revision, wrong owner/tenant, duplicate idempotency,
  and concurrent edits.
- Draft generation receives the approved treatment and lineage once, without
  silently rewriting approved facts or creating a parallel Draft path.
- Focused Vitest/jsdom and Playwright evidence covers success and all failure
  transitions at supported responsive sizes.
