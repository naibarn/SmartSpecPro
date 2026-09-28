# Section 04: Settings, Rollout, and Verification

## Ownership boundary

Own series settings persistence, model/quality UI, localization, new-episode propagation,
job detail diagnostics, rollout gates, and browser evidence. Do not own provider adapter
implementation or story gate internals.

## Target files/modules

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaSettingsTab.tsx`
- `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- shared generation settings types and migrations only if compatibility cannot avoid one
- component/router tests and UI evidence artifact

## UI/UX Contract

### Target User / JTBD

- Role: Drama Series creator/producer.
- Goal: choose one understandable LLM quality level for the series and know when the
  selected model cannot fully support it.
- Entry point: Series Settings.
- Success outcome: the user saves one LLM quality choice and all Drama LLM tasks use it or
  show a clear safe downgrade; image controls remain separate.

### Existing Pattern Reference

- Searched: `VerticalDramaSettingsTab`, `VerticalDramaSeriesDetailPage`, existing model
  policy and image quality controls, and current settings tests.
- Found: the existing series-wide LLM model selector and separate image-generation controls.
- Decision: reuse.
- Reason: preserve current product vocabulary, save flow, localization, and layout density.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Series Settings | `/drama-series/:id?tab=settings` | Add one LLM quality profile beside model selector |
| Image settings | same route | Keep image model/quality separate |
| Job/detail diagnostics | existing Drama job/detail surface | Show effective quality/downgrade reason |
| New episode creation | episode router/service | Copy normalized series profile |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Settings tab | `VerticalDramaSettingsTab.tsx` | visible controls/save UX | model list, profile, mutation state |
| Series detail | `VerticalDramaSeriesDetailPage.tsx` | data loading/prop wiring | series policy/settings |
| Series router | `verticalDramaSeries.ts` | validation/persistence | normalized policy |
| Episode router | `verticalDramaEpisodes.ts` | propagation | series profile |
| Diagnostics surface | existing job/detail component | effective status | audit/result metadata |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | controls skeleton/disabled | component test + browser |
| empty/automatic | profile defaults to Balanced/Auto with explanation | component test |
| unsupported model | selector shows safe downgrade/capability note | component test |
| saving | both controls retain values and primary action disables | component test |
| success | localized confirmation and persisted values remain selected | component/router test |
| error | actionable provider/model/settings error; no false success | component test |
| focus/hover/disabled | visible focus and readable disabled states | browser/a11y check |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | settings cards stack; selectors remain usable without horizontal scroll | screenshot/manual |
| tablet 768x1024 | two setting groups remain visually distinct | screenshot/manual |
| desktop 1440x900 | model and quality controls align clearly | screenshot/manual |
| small-mobile 360x800 | no clipped labels or inaccessible save action | screenshot/manual |
| laptop 1024x768 | dense settings do not overlap sidebar/content | screenshot/manual |
| wide-desktop 1280x800 | no unnecessary stretching or overflow | screenshot/manual |

### Accessibility Acceptance

- Keyboard reaches model, LLM quality, image model, image quality, and save controls in
  logical order.
- Every selector has an explicit Thai/English label and description.
- Capability warnings are associated with the relevant selector.
- Focus remains visible; color is not the sole warning indicator.
- Reduced-motion users receive no required animation for save/downgrade state.

### Copy Contract

- Tone: direct, reassuring, operational.
- Primary languages: Thai and English using existing locale conventions.
- Required labels: `โมเดล LLM`, `คุณภาพการคิดของ LLM`, `โมเดลสร้างภาพ`, `คุณภาพภาพ`.
- Validation: explain that unsupported quality is automatically reduced; do not say the
  generation failed when it was safely downgraded.
- Error: identify actual provider/model and next action.
- Loading/success: distinguish saving settings from running generation.

### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`; capture the required and
extended viewports and record console, keyboard, overflow, localization, and async-state
results.

## TDD expectations

- Update current settings tests rather than creating a parallel settings component.
- Test model changes, capability option changes, save mutation payload, and safe reset.
- Test router authorization and tenant ownership.
- Test new episodes inherit the profile without overwriting episode image settings.

## Rollout acceptance

1. Deploy policy/adapter behind a server-side feature flag or compatibility default.
2. Enable wrapper migration for the five existing stages.
3. Verify mocked fallback/downgrade and audit metadata.
4. Migrate remaining skills and enable coverage gate.
5. Enable Story Truth semantic gates for new runs first; preserve old accepted artifacts.
6. Perform browser evidence and restart/health checks.
7. Perform one explicitly approved, low-cost real-provider smoke after deployment.

## Residual risk

Browser tooling, deployment, provider credentials, and real-credit smoke are external gates;
they cannot be marked passed by unit tests alone. Any skipped evidence must be recorded as
skipped with the reason.
