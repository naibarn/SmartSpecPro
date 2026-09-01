# Section 05 — UI and Selectors

## Scope

Add owner-facing Worker Local AI management, explicit Group sharing, and Worker-backed model
rows to all applicable LLM selectors while preserving existing local-client UI.

## Existing patterns and files

Reuse `apps/web/client/src/components/settings/WorkerAccessKeysPanel.tsx`,
`apps/web/client/src/features/local-ai/components/LocalAiSettingsSection.tsx`,
`apps/web/client/src/components/workflow/LLMModelSelector.tsx`, existing Group controls,
and their tests. Modify only owning components and existing i18n locale files; do not create
a second selector/catalog implementation.

## UI/UX Contract

### Target User / JTBD

Worker owner configures many local providers/models and shares the Worker to Groups they
created. Active shared members select an enabled model and understand Worker relay privacy.

### Surface Inventory

| Surface | Change |
|---|---|
| Worker settings / Local AI | provider/model CRUD, discover/manual, test, status |
| Worker sharing | Private or owner-created selected Groups |
| `LLMModelSelector` and direct consumers | unified actor catalog, task filtering, badge |
| Existing local-client settings | remain separate and unchanged |

### Component Map

| Component | File/owner | Responsibility |
|---|---|---|
| WorkerLocalAiPanel | Worker settings feature | provider/model inventory and actions |
| WorkerModelRow | Worker settings feature | status, capabilities, enablement |
| WorkerSharingControl | Worker settings feature | Private/selected owner-created Groups |
| LLMModelSelector | shared selector surface | task-filtered actor catalog |
| WorkerModelBadge | shared selector UI | Worker/source/privacy provenance |

### State Matrix

| State | Expected behavior |
|---|---|
| loading | skeleton and disabled actions |
| empty | add provider/model guidance |
| error | sanitized error and retry |
| partial | per-provider discovery/status error |
| success | all provider/model rows and revision |
| offline/stale/missing | visible but disabled with last-seen/reason |
| selected | Worker/provider badge and worker-relay disclosure |
| focus/hover | existing visible focus and tokenized hover |

### Responsive Matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | stacked rows, no horizontal clipping |
| tablet 768x1024 | compact two-column metadata where possible |
| desktop 1440x900 | grouped provider/model layout and sharing panel |
| small-mobile 360x800 | scrollable details and compact actions |
| laptop 1024x768 | dialog/selector remains usable |
| wide-desktop 1280x800 | no table overflow |

### Accessibility Acceptance

Keyboard-only operation, visible focus, semantic list/table structure, labelled controls,
screen-reader selected Group state, non-color status text, contrast, and reduced-motion
behavior are required.

### Copy Contract

Thai primary with English fallback. Use “Local Worker”, “Private”, “Selected groups”,
“Worker relay”, “Cloud can see this prompt”, “Offline”, “Model missing”, “Capability changed”,
“Retry”, and “Change model”. Never display endpoint, credential, path, or raw provider error.

### Browser Evidence Required

Follow the repository browser verification guide. Capture owner/member, share/revoke, and
offline/selected states at mobile 390x844, tablet 768x1024, and desktop 1440x900. If browser
tooling is unavailable, report it as unverified rather than passing it.

## Tests first and done

Add component tests for CRUD/share states, task filtering, badges, keyboard/focus and i18n;
run focused tests only. Done when all direct LLM selectors use the actor catalog and no media
selector shows Worker LLM rows.

## Implementation record

- Added Worker App `LocalLlmSettingsScreen` for multiple provider/model CRUD,
  explicit provider binding, enablement, and keyring secret set/delete.
- Added web `WorkerLocalAiPanel` with provenance/readiness display; existing Worker
  sharing controls remain the owner Group ACL surface.
- General selector data paths now include Worker rows through both catalog endpoints;
  focused jsdom proof covers Worker model rendering and existing Worker settings.
