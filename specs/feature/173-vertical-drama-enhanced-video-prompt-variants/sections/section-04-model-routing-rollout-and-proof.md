# Section 04 — Model separation, rollout, and proof

## Objective

Prove that Enhanced uses the correct media model without coupling image,
authoring, and video roles, while demonstrating that Legacy and unrelated skills
remain unaffected.

## Model policy

Persist and resolve independently:

- `selectedImageModelId` for image/start/stop frame generation;
- `authoringModelId` for Enhanced reasoning and vision/structured output;
- `selectedVideoModelId` for the actual video target and provider compiler.

Persist `sourceImageModelId` only as approved-frame provenance. It is not a
video target and does not invalidate an unchanged approved asset by itself.

Successful Enhanced variants must also retain the exact server-resolved Feature
170 media bundle, target capability snapshot, and provider profile/plan ID plus
hash. `warnings`, assumptions, and research IDs remain variant diagnostics;
render-task `videoTask` and post-render `identityQc` stay outside the prompt
variant. The adapter must set `researchMode=off` by default and use a Core-owned
read-only tool allow-list rather than package defaults.

Same-provider reuse is allowed only as a connection/preset optimization. The
model IDs, capability profiles, prompt budgets, reference limits, and retry
semantics remain separate.

An image/video model pair may point to one catalog row only when that row
explicitly declares both capabilities. The UI and persistence still keep the
two role IDs separate. Enhanced authoring never becomes a video-render call.

## Feature flags

Use separate kill switches for:

1. Enhanced Storyboard UI;
2. Enhanced job admission;
3. Enhanced Apply projection.

All default off for existing tenants/series until runtime and browser evidence
passes. Turning off Enhanced must not remove Legacy data or disable Legacy
generation.

| UI | Jobs | Apply | Behavior |
|---|---|---|---|
| off | any | any | Hide new Enhanced generation/apply controls; Legacy remains unchanged; retain a non-interactive active provenance indicator when Enhanced is active; normal stale/capability gates still apply. |
| on | off | off | Show stored previews if present; admit no jobs and no Apply. |
| on | off | on | Admit no new jobs; allow only an already-ready, non-stale stored variant to Apply. |
| on | on | off | Allow preview generation but no active projection change. |
| on | on | on | Enable full preview/edit/Apply/restore flow. |
| later disabled | any | any | Keep stored variants and active Enhanced projections readable; normal stale/capability gates still apply; block only the disabled operation. |

## Proof gates

- focused contract/router/service tests;
- runtime variant-schema validation and preservation through existing
  motion-pack writers;
- Legacy regression suite;
- model capability matrix;
- credit/idempotency/concurrency tests;
- browser proof with flag off and on;
- runtime readiness diagnostics;
- isolated SDK/package/manifest version proof and no shared upgrade assumption;
- cost, latency, provider rejection, stale-rate, and regeneration metrics;
- explicit report of any unverified live-provider/deployment surface.

## Canary metrics

Compare Legacy and Enhanced by shot/model without mixing them:

- successful structured output rate;
- provider admission/refusal rate;
- reference/capability block rate;
- continuity and dialogue warnings;
- regeneration and Apply rate;
- latency and credits per ready variant;
- stale variant rate after model/media changes;
- recovery success after refresh or worker restart.
- old-media preservation and `prompt_mismatch` rate after prompt switches.

## UI/UX Contract

### Target User / JTBD
- Role: creator and rollout operator.
- Goal: see model-role truth and safely control Enhanced rollout.
- Entry point: Storyboard prompt card and rollout diagnostics.
- Success outcome: image, authoring, and video roles are never mislabeled.

### Existing Pattern Reference
- Searched: model selectors/badges and feature-flag diagnostics in the existing
  Vertical Drama page and media-model router tests.
- Found: current selected video/image model controls and capability warnings.
- Decision: reuse those labels and capability gates; add only role separation.
- Reason for no new visual system: Legacy users must see the same controls.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Model summary | Storyboard prompt card | Show image/authoring/video roles |
| Rollout diagnostics | Admin/feature gate response | Expose operation-specific state |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Model-role badges | Existing Storyboard UI | Presentation | Readiness/provenance |
| Flag matrix | Server flag service/router | Admission policy | Tenant/series flags |
| Proof harness | Focused tests/browser fixtures | Evidence | Stable UI/API contracts |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Model/flag details load without enabling prematurely | Component tests |
| empty | Missing model is a clear blocker | Readiness tests |
| error | Capability/flag error is explicit | Router tests |
| success | Three model roles and hashes are visible | UI/integration tests |
| disabled/focus/hover | Disabled operation is explained; no hidden side effect | Accessibility/browser proof |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Role labels remain readable/wrap | Browser proof |
| tablet 768x1024 | Badges and diagnostics do not overlap | Browser proof |
| desktop 1440x900 | Model summary fits existing hierarchy | Browser proof |
| small-mobile 360x800 | Long provider names wrap safely | Browser proof |
| laptop 1024x768 | N/A; use tablet/desktop evidence | Logged |
| wide-desktop 1280x800 | N/A; no new data-dense surface | Logged |

### Accessibility Acceptance
- Role labels are visible text and accessible names, not color-only badges.
- Flags and diagnostics are keyboard-reachable where interactive.
- Focus, contrast, and reduced-motion behavior follow existing app baseline.

### Copy Contract
- Tone: operational and unambiguous.
- Primary language(s): Thai and English.
- Required labels: Image model, Prompt authoring model, Video target model,
  unavailable, rollout disabled, provenance unknown.
- Validation/error copy: do not call an image model a video target.
- Empty/loading/success copy: use the section 03 keys and model-role wording.
- Localization/fallback notes: English fallback preserves model IDs exactly.

### Browser Evidence Required
- Follow `skills/orchestra/references/ui-browser-verification.md` and capture
  flag matrix, role badges, stale state, and Legacy unchanged evidence.

## Implementation Record

- Added three independent, default-off tenant flags for UI, Enhanced jobs, and
  Apply; the allow-list and defaults are tested.
- Enhanced input locks one server-selected video target model, carries an
  explicit capability fingerprint and provider profile, and sends no fallback
  or cross-provider fallback instruction.
- Added authoring-model/vision readiness checks and blocked synthetic/unknown
  provider targets from Enhanced readiness.
- Added runtime/package/SDK/adapter/manifest provenance to the persisted
  Enhanced variant and job result.
- Deployment configuration, live provider acceptance, and browser evidence are
  explicit activation gates. Actual token-based Core billing is implemented
  with idempotent settlement; live billing acceptance is still required. No
  production default is changed by installing the skill.
- The confirmation estimate uses the configured authoring model's pricing
  function and the final settlement uses actual bridge-reported token usage.
