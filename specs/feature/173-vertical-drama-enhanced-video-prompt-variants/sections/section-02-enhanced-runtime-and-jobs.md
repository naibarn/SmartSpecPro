# Section 02 — Isolated Enhanced runtime and durable jobs

## Objective

Run the Generic Commercial Video Director as a constrained Vertical Drama
authoring adapter in an isolated compatible runtime, without changing global
skill routing or giving the Agent workflow authority.

## Runtime boundary

The adapter receives a server-built canonical input snapshot and returns a
schema-validated full prompt bundle. Core remains authoritative for:

- tenant/user/series/episode/shot ownership;
- approved media resolution and signed transport;
- exact target video model and capability profile;
- credits, rate limits, idempotency, jobs, persistence, and render dispatch.

The adapter must not select a provider/model, submit video generation, publish,
delete, or mutate canonical story data.

The input adapter must override the Generic schema's permissive defaults with
`modelRouting.mode="locked"`, one exact selected video model, no fallback model,
and `allowCrossProviderFallback=false`; it must explicitly set
`researchMode="off"` unless bounded research was separately requested and
admitted. It also uses `generationMode="plan_only"` and preserves canonical
dialogue/media instead of allowing the Agent to invent or regenerate them.
Core constructs the tool allow-list: asset evidence and the pinned provider
profile are allowed by default, bounded research is opt-in, and the cost
estimate tool is optional/advisory only. Package defaults must not broaden this
list.

V1 uses isolation because the current app backend pins
`openai-agents==0.21.1` while the target package declares a compatible 0.22.x
range. A shared SDK upgrade is a separate compatibility project, not a hidden
dependency of the Enhanced button. The gate reports the runtime/package/
manifest/SDK versions and blocks with a diagnostic on mismatch.

## Readiness gate

Before admission, verify feature flag, package/manifest, SDK compatibility,
authoring model, target video profile, approved media, and required vision
capability. Return structured diagnostics. Never silently invoke Legacy when the
Enhanced gate fails.

Expose the same read-only readiness result to the Storyboard so a disabled CTA
can explain the exact blocker without attempting a paid job. The readiness
response is recomputed server-side for the requested shot/model and is not an
authorization substitute for the final admission check.

## Job contract

The durable job key includes tenant, user, series, episode, shot, variant,
operation, and idempotency key. The job also carries an explicit operation
(`generate` or
user-confirmed `finalize`) so paid post-edit finalization cannot be confused
with initial generation. Every status/error key includes `shotNumber +
variantId`, while a split shot also has an aggregate group status. A split shot
returns an ordered result for every exact clip mapping. Job state is independent
from Legacy state and survives refresh. Edit/finalize writes use expected
variant revision/hash CAS and stale conflicts never overwrite newer text.

The slow Agent call runs outside the final DB lock. Final merge uses a fresh
read, row lock/compare-and-swap, captured bundle revision/fingerprint, and task
ID guard.

Feature flags are checked at admission and terminal merge. An in-flight job may
persist a non-active preview after a normal flag disable, or fail closed with a
credit settlement on an emergency kill switch; it must never fall back to
Legacy, mutate active projection, or delete a prior result.

## Model-aware pipeline

```text
server-resolved Drama context
  → approved Feature 170 media bundle
  → exact selected video-model capability snapshot
  → Enhanced structured authoring
  → provider/model compiler
  → terminal finalizer
  → schema, capability, budget, and hash checks
  → persist Enhanced variant only
```

There is one terminal semantic writer. The Agent returns structured intent; the
Feature 170/app-owned provider-aware compiler/finalizer writes the final bundle.
No later independent optimizer may rewrite semantics. A repair must re-enter the
same finalizer and generate a new terminal hash, or fail closed.

The selected image model is used only to create the approved image asset. The
authoring model is an LLM role. The video model is the provider target and is
the source of prompt limits and execution semantics.

## Required tests

- SDK/manifest/model readiness failures;
- vision-required and vision-unavailable paths;
- target model capability matrix;
- mixed reference and start/stop validation;
- credit admission and no silent fallback;
- retry classification and recovery;
- concurrent jobs and exact split-shot mapping;
- group-atomic Apply and render provenance mismatch preservation;
- no private URL or sensitive media leakage.

## UI/UX Contract

### Target User / JTBD
- Role: Vertical Drama creator.
- Goal: understand whether Enhanced is ready before spending credits.
- Entry point: Enhanced button readiness/status in Storyboard.
- Success outcome: every blocker is actionable and Legacy remains available.

### Existing Pattern Reference
- Searched: existing per-shot async prompt job polling and error/toast patterns
  in `VerticalDramaEpisodePage.tsx` and `VerticalDramaStoryboardPanel.tsx`.
- Found: existing Legacy durable submit/poll flow.
- Decision: reuse the polling/status vocabulary but diverge in job identity so
  Enhanced cannot clobber Legacy state.
- Reason: separate paid operation and variant provenance require isolation.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Readiness/status | Vertical Drama Storyboard | Add read-only Enhanced diagnostics |
| Confirmation/job | Existing prompt action area | Add separate Enhanced lifecycle |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Readiness projection | Vertical Drama router/service | Machine-readable gate | Core runtime facts |
| Job status view | Existing Storyboard/page | Display only | Enhanced job projection |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Enhanced status is queued/running without changing Legacy | Router/UI tests |
| empty | Clear not-generated state | Component tests |
| error | Retryable reason and no fallback claim | Job tests |
| success | Preview-ready with exact model/provenance | Job/UI tests |
| disabled/focus/hover | Readiness blocker is actionable; no spend | UI tests |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Blocker and status remain reachable | Browser evidence in section 03 |
| tablet 768x1024 | Status wraps without overlapping Legacy | Browser evidence in section 03 |
| desktop 1440x900 | Paired actions remain distinct | Browser evidence in section 03 |
| small-mobile 360x800 | Long runtime copy wraps/collapses accessibly | Browser evidence in section 03 |
| laptop 1024x768 | N/A; covered by tablet/desktop | Logged in section 03 |
| wide-desktop 1280x800 | N/A; no separate layout owner | Logged in section 03 |

### Accessibility Acceptance
- Readiness and job status have accessible labels and non-color semantics.
- Live updates do not steal focus; disabled controls explain why.
- Reduced motion preserves text progress and errors.

### Copy Contract
- Tone: explicit about readiness, cost, and no hidden fallback.
- Primary language(s): Thai and English.
- Required labels: Enhanced unavailable, queued, running, retry, no fallback.
- Validation/error copy: distinguish runtime, model, media, credit, and stale errors.
- Empty/loading/success copy: use the section 03 stable keys.
- Localization/fallback notes: safe English fallback.

### Browser Evidence Required
- Follow `skills/orchestra/references/ui-browser-verification.md`; section 03
  owns the browser capture of the states produced here.

## Implementation Record

- Implemented the server-side runtime contract and readiness gate in
  `apps/web/server/services/verticalDramaEnhancedVideoPrompt.ts`.
- Added the isolated JSON-lines OpenAI Agents SDK bridge at
  `apps/web/skills/generic-commercial-video-director/src/smartaihub_video_director/enhanced_bridge.py`.
  It is plan-only, read-only, validates terminal output, and has no provider,
  credit, callback, or database side effects.
- Partitioned Enhanced jobs/idempotency by variant and added server-side
  row-lock/CAS merge, stale-result protection, and explicit error classes.
- Added additive router procedures for readiness, generate, polling, edit,
  finalize, Apply/restore, and split-shot group Apply.
- Runtime activation is fail-closed until the bridge, allow-list, supported SDK,
  authoring model, target catalog profile, and feature flags are configured.
- Core now charges the actual Agents SDK token usage with an idempotent job key
  after the successful Agent call; live provider/browser proof remain rollout
  gates. Enhanced never silently falls back to Legacy.
- Readiness includes a conservative token-based estimate for the single
  confirmation dialog; the final charge uses returned SDK usage.
