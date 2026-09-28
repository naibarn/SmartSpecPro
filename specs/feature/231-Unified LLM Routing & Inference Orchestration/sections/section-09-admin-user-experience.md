# Section 09 — Admin and user experience

## Goal

Make automatic selection understandable and safely operable while preserving user choice and explicit security gates.

## Implementation

1. Admin manages versioned model/deployment candidate profiles and policy revisions. The local slice provides candidate JSON publication, pinned connectivity and capability probes with immutable receipts, audited tenant/principal-scoped emergency model/deployment revocation with mandatory expiry, immutable profile certification records, signed rollout-bundle persistence, and a rollout status panel with signature verification state. Profile promotion requires an authorized Admin action and a latest, fresh, complete capability receipt; the server rechecks the candidate and receipt atomically. This is a one-time qualification gate, not approval for each inference request. Ordinary eligible AUTO routing must proceed without user confirmation. The Admin panel shows current certified-capability evidence and offers activation for valid inactive bundles; the admin mutation rechecks the capability reference and all activation gates transactionally. Target-environment readiness still defaults to deny, so the control reports server-side blockers and cannot activate while that gate is unavailable. Bundle authoring UI, route inspector, canary and drift response remain unimplemented.
2. Add a route inspector with include/exclude reason codes, policy/registry/release revisions, actual-vs-planned provider and evidence links; exclude prompt/source/secret data.
3. Make AUTO the normal user choice so users are not asked to approve every eligible technical route. Expose stable model/provider locks and explain why incompatible fallback needs consent.
4. Preserve role/tenant authorization and audited operations; activation is transactionally atomic when readiness gates pass and old plans remain pinned unless emergency revocation applies.
5. Test responsive, accessibility, loading, stale state, no-route, consent-required and degraded states.

## Tests first

- Admin/user role and cross-tenant boundary tests.
- Inspector redaction and reason/evidence coverage.
- Playwright AUTO selection, lock persistence, consent-required, no-route, canary and rollback flows.
- Keyboard, screen reader and mobile/tablet/desktop checks.

## Acceptance

- Ordinary eligible requests need no manual provider confirmation.
- High-risk, locked-route incompatibility or unauthorized route does not gain implicit approval.
- Admin operations are auditable, permissioned and rollbackable.

## UI/UX Contract

### Target User / JTBD
- Role: user/tenant operator chooses a route preference; authorized platform admin qualifies models and operates rollout/incident controls.
- Goal: use automatic safe selection by default and understand route eligibility without exposing prompts or secrets.
- Entry point: existing chat model selector and existing Admin LLM Providers/Models pages.
- Success outcome: routine request dispatches automatically; explicit lock works; operator can identify why a route was excluded and roll back an approved bundle.

### Existing Pattern Reference
- Searched: `rg --files apps/web/client/src/pages | rg -i '(Admin.*(Model|Provider|LLM|AI)|.*Settings)'`.
- Found: `apps/web/client/src/pages/AdminLLMProviders.tsx`, `AdminLLMModels.tsx`, `AdminMediaProviders.tsx`, and related page tests.
- Decision: reuse the existing Admin LLM Providers/Models navigation, forms, status badges and table patterns. Add the inspector/rollout surfaces within that vocabulary unless existing components cannot represent the needed audit trail.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Chat model selection | current chat selector/caller (resolve during Wave 07) | AUTO default, stable lock, route explanation, consent only for a real policy boundary |
| Admin catalog | `apps/web/client/src/pages/AdminLLMProviders.tsx`, `AdminLLMModels.tsx` | versioned deployment qualification and capability status |
| Admin route operations | existing admin navigation plus new route-specific component after router API exists | policy diff/publish/rollback, eligibility inspector, drift/incident state |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Route preference selector | current chat selector path; locate before implementation | AUTO/model/provider/local preference | eligible-model API |
| Deployment qualification panel | Admin LLM Models/Providers page | probe/certification status and revision | admin router APIs |
| Route inspector | new component colocated under existing admin UI structure | eligible/excluded reason codes and safe evidence refs | authorized simulation result |
| Rollout controls | new component colocated under existing admin UI structure | publish/canary/rollback/emergency fence | versioned rollout bundle |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | preserve prior selection; show bounded progress | component and browser test |
| empty | explain no eligible model and safe available next action | API/UI contract test |
| error | typed safe outcome and retry guidance | error taxonomy test |
| success | show AUTO or locked preference and actual route only when policy allows | integration/browser test |
| partial success | show degraded/observed-vs-unverified state | component test |
| disabled | explain policy/qualification gate; no misleading active control | authorization test |
| selected | persist stable logical model/provider lock | round-trip test |
| hover/focus | token-consistent affordance and visible focus | Playwright/accessibility pass |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | selection is one-column; inspector details collapse without losing reason/lock | Playwright screenshot |
| tablet 768x1024 | forms and status details remain readable; tables use controlled horizontal scroll or cards | Playwright screenshot |
| desktop 1440x900 | registry and route operations use existing admin density | Playwright screenshot |
| small-mobile 360x800 | test lock/error message overflow | extended Playwright screenshot |
| laptop 1024x768 | test filter/inspector split layout | extended Playwright screenshot |
| wide-desktop 1280x800 | verify dense operations table and sticky controls | extended screenshot |

### Accessibility Acceptance
- Keyboard path reaches route preference, route details, publish and rollback in logical order.
- Focus remains visible after async refresh and dialog close.
- Controls have explicit accessible names and state semantics; tables have headers.
- Text/status contrast uses existing semantic tokens; color is not the only state indicator.
- Reduced motion avoids route-transition animation dependence.

### Visual Direction and Tokens
- Reuse existing SmartSpec admin components/tokens. Before implementation inspect `AdminLLMProviders.tsx`, `AdminLLMModels.tsx`, shared table/form primitives and theme tokens.
- Keep the interface operational and information-dense but progressive: AUTO choice is simple; advanced route rationale is expandable; no raw scoring detail in ordinary chat.
- Do not introduce raw colors/sizes or a new visual system.

### Copy Contract
- Tone: clear, neutral and nontechnical by default; detailed reason code available to admins.
- Primary languages: Thai and English through existing locale files.
- Labels: Automatic (AUTO), Choose model, Lock provider, Local only, Fallback, Estimated cost, Why this route, Route status.
- Validation/error copy: distinguish no eligible model, explicit lock unavailable, consent required, policy not ready, route drift, budget unavailable and unverified result.
- Localization fallback: stable server reason codes; client localized label; never render raw provider error or prompt.

### Browser Evidence Required
- Capture mobile 390x844, tablet 768x1024 and desktop 1440x900 for success, loading, empty/no-route, explicit-lock conflict and admin drift/rollback states.
- Verify console, overflow, keyboard path, labels, focus, dark/light support where enabled, and authorized admin/user separation.
- Store artifacts under `specs/feature/231-Unified LLM Routing & Inference Orchestration/implementation/ui-browser-evidence.md` with screenshots/traces. No UI is implemented in the current planning wave, so this evidence is pending.
