# Section 04 — Draft review UI

## Ownership

Existing `CreateSeriesWizard` draft card only. Reuse current Field, Badge, Alert, Button,
and warning-state patterns.

## UI/UX Contract

### Target User / JTBD
- Role: creator reviewing an AI-generated draft
- Goal: confirm that identity, market, language and story engine are coherent before Apply
- Entry point: Create Series → generated Draft card
- Success outcome: user understands what AI inferred and can apply or repair without filling every tab

### Existing Pattern Reference
- Searched: `CreateSeriesWizard.tsx` draft language card, title picker, warning list and apply gate
- Found: existing draft confirmation card and `Field`/`Select`/`Badge` patterns
- Decision: reuse
- Reason: preserve current wizard behavior and avoid another modal or review flow

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Draft identity card | `CreateSeriesWizard.tsx` | Separate market/setting/background/dialogue/naming rows |
| Story design card | `CreateSeriesWizard.tsx` | Show romance/pressure/early-payoff summary and decision state |
| Warning state | `CreateSeriesWizard.tsx` | Friendly copy plus technical details disclosure |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Identity assumptions panel | existing draft card | rows, source badges, ambiguity choice | `storyContext` |
| Story design summary | existing draft card | engine and progression summary | `storyDesignContract` |
| Apply gate | existing button state | structural error blocking | normalized diagnostics |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton/disabled Apply; retry remains clear | component test |
| empty | existing “generate draft” CTA | existing test |
| error | actionable synthesis error, no stale assumptions | component test |
| success | identity/story cards visible | component test |
| partial | “AI inferred”/“needs decision” badges; no silent country | shared/UI test |
| disabled/focus/hover | Apply disabled for unresolved structural error; keyboard focus visible | UI test/static review |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | rows stack, no horizontal overflow | component/static review |
| tablet 768x1024 | compact two-column metadata where safe | component/static review |
| desktop 1440x900 | existing draft card hierarchy retained | component/static review |

### Accessibility Acceptance
- Visible labels and source text; no color-only status.
- Keyboard can reach repair/choice/apply controls in reading order.
- `aria-live` for repair/result messages and visible focus states.
- Amber/destructive contrast remains readable in light/dark themes.

### Copy Contract
- Thai UI: plain creator language; technical enum values only inside expandable details.
- English UI: equivalent concise labels.
- Required labels: Target market, Story setting, Lead background, Origin, Spoken dialogue,
  Naming rule, Story engine, Pressure, Early payoff, Romance progression.
- Ambiguity copy must say “ยังไม่ระบุ/Not specified”, never imply a guessed nationality.

### Browser Evidence Required
- Follow `skills/orchestra/references/ui-browser-verification.md`; use 390x844, 768x1024,
  and 1440x900 when authenticated browser access is available. Otherwise report skipped.
