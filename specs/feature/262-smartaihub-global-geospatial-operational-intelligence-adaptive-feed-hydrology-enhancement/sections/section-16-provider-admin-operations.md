# Section 16 — Provider administration, rights, cost and observability

## Goal / ownership

Expose safe operator control for provider adapters and regional capabilities, and prove source, map, feed and hydro operations with bounded observability. Reuse existing Admin Settings, Infrastructure settings, provider health and audit patterns; do not build an unrelated settings store. Sections 06 and 11 own source/capability contracts; section 14 owns privacy; section 17 owns release/model lifecycle. All shared schema/config edits are conductor-serial.

## Tests first

- Router/service tests reject unauthorized provider or region edits; validate source approval, license/purpose, jurisdiction, cadence, quota, attribution, API secret reference and expected silence.
- Test API credential replace/rotate/revoke without exposing stored secrets; change creates an audited revision and invalidates affected session/caches safely.
- Test kill-switch scope and expiration, staged pause/resume, canary/shadow provider, source health status, planned maintenance and heartbeat-derived degraded capability.
- Test cost/load-shed budgets preserve P0 emergency intake and minimum public information; optional enrichment degrades first; per-region SLO does not hide province-level degradation.
- Test metrics/traces/logging redact credentials, protected coordinates, report content and raw payloads; verify bounded-cardinality labels.
- Test Google/other map attribution and license gates block prohibited persistent/offline/redistribution choices.

## Implementation steps

1. Inspect `apps/web/client/src/components/admin/InfrastructureSettingsPanel.tsx`, `AdminSettings`, current map settings UI and server `geoMapSettings.ts`; preserve any existing dirty user changes. Identify existing provider registry/config authority before creating new modules.
2. Extend the canonical Spec260 operations route or existing admin router with tenant/role/capability checks, explicit validation, CSRF/idempotency and audit. Secrets are written through existing secret-storage boundary; APIs return `configured`, last rotation time and masked status, never secret material.
3. Store lifecycle/rights/health policy in canonical provider/source configuration only if no matching authority exists. Version config revisions and require explicit review before enabling new/changed rights. Expired rights disable only affected layer/adapter and retain immutable observations as policy allows.
4. Add per-provider, per-region/municipality and per-capability metrics for latency, success/error class, freshness, expected silence, retry/circuit state, ingestion lag, cost budget, queue age, projection lag and model validity. Use bounded metric labels, stable error codes and dashboard aggregates.
5. Make controls scoped: pause/rollback one provider/layer/model/region; kill switch has actor, reason, expiry and audit. It must not disable unrelated P0 emergency intake or bypass user-facing coverage indicators.
6. Keep Cloudflare proxy and Linux service on a shared admin contract. Do not expose raw credentials to workers/browser unless explicitly necessary and narrowly scoped; transport secrets only via approved binding references.

## UI/UX Contract

### Target User / JTBD
- Role: authorized platform/provider operator.
- Goal: review provider rights, health, coverage, rotation and failure scope without accidentally hiding safety limits or leaking credentials.
- Entry point: existing Admin Settings/Infrastructure dashboard.
- Success outcome: a validated and audited configuration with visible status, scope, expiry, coverage and rollback path.

### Existing Pattern Reference
- Searched: `rg -n "InfrastructureSettingsPanel|GoogleMapsSettingsPanel|provider|health|configuration" apps/web/client/src/components/admin apps/web/client/src/pages/Admin`.
- Found: existing infrastructure/admin settings patterns and map settings panel.
- Decision: reuse current admin navigation, card/form, secret-mask and save/test/refresh patterns; don't add a new admin route unless shared manifest requires it.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Admin provider controls | existing `AdminSettings` / `InfrastructureSettingsPanel.tsx` | Show approved source/capability status, health, rights and bounded actions |
| Map provider config | existing map settings component | Clarify browser/server key roles, provider availability and test status |
| Operations dashboard | existing Admin queue/health surfaces | Add lag/freshness/provider metrics |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Existing admin settings panel | current admin components | form, save/test, masked credentials | validated router DTOs |
| Provider health summary | existing dashboard card/table pattern | health/coverage/lag display | aggregated redacted metrics |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Existing skeleton; secrets remain masked | RTL |
| empty | Explicit no configured providers and onboarding guidance | RTL |
| error | Stable error code and safe retry/rollback | Service/router tests |
| success | Approved config revision, rights and last verified time | UI + router |
| partial success | Per-region/layer degraded detail; do not hide unaffected capabilities | Fixture |
| disabled | Paused/expired/kill-switch status and expiry visible | RTL |
| focus/hover/selected | Keyboard-accessible action with no color-only state | A11y/browser |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Read-only status prioritized; destructive/disable action not cramped | Browser |
| tablet 768x1024 | Tables collapse to labeled cards | Browser |
| desktop 1440x900 | Health/config panes remain legible | Browser |
| small-mobile 360x800 | Controls do not overflow | Browser |
| laptop 1024x768 | Save/test and audit scope remain reachable | Browser |
| wide-desktop 1280x800 | Wide metrics table has responsive overflow strategy | Browser |

### Accessibility Acceptance
- Keyboard order follows provider → scope/rights → status → action → confirmation.
- Focus visible after save, rotate, disable or error.
- Labels describe exact provider/scope; form errors are associated with fields; secret values are never read back.
- Contrast follows product tokens; status includes text; reduced-motion respected.

### Copy Contract
- Bilingual Thai/English; clear “credential configured” versus “API connectivity pass” versus “map rendered” distinction.
- Explain impact/scope before disabling source or layer; expired rights and quota are separate errors.
- Success/error copy includes revision/time and safe next action, not provider response bodies.

### Browser Evidence Required
- Use existing admin UI and authenticated test role. Cover setup/empty, save/validation, secret rotation, test vs renderer result, expired rights, partial regional outage, scoped kill switch, mobile, keyboard and masked output.

## Completion evidence / final gates

Focused policy/router/admin tests and privacy-safe metric assertions pass. Local view demonstrates masked secret and audited/scope-limited controls. Live provider quotas, Google billing/rights, real operators and production dashboard/Cloudflare bindings remain external gates.
