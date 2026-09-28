# Vertical Drama Episode Cover Safety Rewrite

## Goal

Increase the chance that Vertical Drama episode-cover generations pass provider
content-safety review when the rejection is caused by avoidable wording risk,
while preserving the story, characters, logos, reference-image selection,
layout, and aspect ratio. This is a legitimate safety normalization step, not
a bypass for disallowed content.

## Current gap

`generateEpisodeCover` assembles the final cover prompt and sends it through
both the regular media path and the Hermes path. The regular media path marks
Vertical Drama requests as `vertical_drama_managed`; that mode records a safety
check but intentionally returns the prompt unchanged. The Hermes path submits
the assembled prompt directly. The existing generic safety-rewriter is
documented for non-drama prompts, while the Vertical Drama policy-safe skill is
limited to shot Start Frame prompt generation.

## Recommended design

Add a dedicated `vertical-drama-episode-cover-safety-rewriter` skill and invoke
it once on the final assembled cover prompt before either transport branch.
The skill returns a strict JSON object containing `safePrompt`, risk level,
blocked state, material changes, and preserved intent. It may only soften:

- graphic or actionable violence into non-graphic cinematic wording;
- coercive, threatening, or forced conduct into non-coercive dramatic framing;
- sexualized or explicit wording into non-sexual, age-appropriate framing;
- ambiguous minor/adult wording when clarification is necessary for safe
  depiction.

It must preserve the original language, plot facts, subject count, logo
instructions, reference mapping, composition, style, and output ratio. An
inherently disallowed request remains blocked.

The service will add an explicit internal `vertical_drama_cover` safety mode.
The episode-cover router will prepare the prompt before credit reservation and
before choosing Hermes versus the normal media transport. Both branches will
receive the same prepared prompt and safety metadata. The normal media service
will recognize an already-validated prepared marker by matching its safe-prompt
hash, preventing a second rewrite. The marker remains internal/persisted
metadata and is not sent as provider prompt content.

The cover's existing JSONB state will carry a bounded `safetyReview` summary
(`skillId`, version, mode, risk, rewritten, fallback, blocked, original/safe
hashes, changes, and preserved-intent strings). This is additive JSONB data, so
no SQL migration is needed and older cover states remain readable.

## Data flow

```text
narrative + selected references + logos
        -> build final cover prompt
        -> cover safety rewriter
        -> blocked: fail before charge/submission
        -> safePrompt + metadata
        -> persist safe prompt and hashes
        -> Hermes OR normal media transport
        -> provider moderation/output review
```

Provider rejection remains a distinct terminal result: rewriting improves
prompt-side false positives but cannot guarantee that the generated pixels or
reference images will pass provider moderation. A deterministic safety
contract/deployment mismatch is terminal rather than retried indefinitely.

## Failure handling

- Empty or malformed safety output: fail closed for medium/high-risk prompts;
  do not submit an unreviewed cover. The skill is attempted for every cover;
  low-risk prompts may retain the existing bounded fallback behavior if the
  safety dependency is unavailable.
- Skill explicitly blocks: return the existing policy-blocked error and do not
  deduct credits or enqueue a task.
- Safety dependency unavailable: return retryable service-unavailable behavior,
  preserving the existing fail-closed contract.
- Safe rewrite succeeds: charge and enqueue only the prepared prompt; store its
  prompt hash and safety metadata for audit/debugging.
- A terminal cover failure is reconciled against its persisted credit
  reservation before the cover state is cleared. Any subsequent retry uses a
  fresh idempotency key so a refunded attempt cannot be mistaken for the old
  reservation.

## Security and data boundaries

The safety skill receives prompt text and reference count, never provider URLs
or signed media credentials. Tenant/user authorization and reference selection
remain unchanged. The safety marker is validated server-side, stripped from
provider-facing parameters, and cannot authorize a request by itself without a
matching safe-prompt hash.

## Verification

Focused tests will cover:

1. safe cover prompt is unchanged and marked checked;
2. risky but allowed wording is minimally rewritten;
3. inherently disallowed wording is blocked before credit reservation;
4. safety-review outage is retryable and fail-closed;
5. Hermes and normal media transports receive identical prepared prompts;
6. normal media does not rewrite an already-prepared prompt a second time;
7. safety metadata and hashes are persisted without leaking provider URLs.

No database migration is required. Browser, live-provider, and production
verification remain separate from local focused tests.

## Trade-offs

This adds one LLM safety-review call to each episode-cover submission and may
slightly increase latency/cost. The benefit is a domain-specific rewrite that
protects cover composition and narrative fidelity better than applying the
generic non-drama rewriter to the entire prompt. Automatic provider retry is
not included in this change to avoid duplicate credit consumption and repeated
generation without evidence that the first failure was prompt-only.
