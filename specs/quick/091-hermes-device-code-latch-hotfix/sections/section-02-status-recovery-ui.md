# Section 02 - Status recovery and UI

Ownership:

- `apps/web/server/services/hermesConnectionService.ts`
- `apps/web/server/services/__tests__/hermesConnectionService.test.ts`
- `apps/web/client/src/components/settings/HermesConnectPanel.tsx`
- its focused component tests

## UI/UX Contract

### Target User / JTBD
- Role: authenticated Grok/Hermes user
- Goal: reach xAI browser authorization or receive an actionable error
- Entry point: Settings, Grok via Hermes connect button
- Success outcome: URL/code shown without a blank terminal or silent polling

### Existing Pattern Reference
- Searched: `HermesConnectPanel` current device-code and typed-error surface
- Found: existing `hermes-connect-error`, retry button, bilingual error copy
- Decision: reuse
- Reason: preserves established recovery behavior and minimizes visual change

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Device-code card | `/settings` | explicit waiting/recoverable error |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| HermesConnectPanel | settings component | polling, URL/code, retry | getConnectStatus |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | connecting/waiting copy | component test |
| error | bilingual message and retry | component test |
| success | URL/code action | existing + focused test |
| focus | buttons retain visible focus | semantic role assertions |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stacked card/actions | build + existing responsive classes |
| tablet 768x1024 | no overflow | build + manual screenshot if available |
| desktop 1440x900 | existing card layout | user screenshot + component test |

### Accessibility Acceptance
- Keyboard path: connect, consent, open xAI, retry are buttons
- Focus visibility: existing Button focus behavior
- Labels/semantics: status text plus named buttons
- Contrast: existing error/status tokens
- Reduced motion: only existing loading spinner

### Copy Contract
- Tone: direct and operational
- Primary languages: Thai and English
- Error copy: existing typed Hermes error copy
- Loading copy: explain that Hermes is preparing browser authorization
- Fallback: active application language

### Browser Evidence Required
- Record desktop production evidence after release.
- Mobile/tablet may be marked skipped if no authenticated browser automation is available.

Acceptance:

- Raw-only legacy event never returns raw content.
- UI stops silently polling and offers recovery.
