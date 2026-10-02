# Section 06 — Native Authoring UI

## Implementation status — blocked, 2026-10-02

No authoring UI or route was added. Section 02 has only an injected repository boundary with no durable tenant/project owner and Section 04 lacks live Spec 224/256 authority ports. Section 03 now has a verified pinned Astryx catalog and pure resolver, but no approved user-facing wrapper is wired. Wiring controls now would expose an authoring flow that cannot safely persist or hand off designs. Resume only when storage and authority owners close their gates. Do not add a route or mock-only user-facing save experience.

## Goal

Build the authenticated SmartAIHub product surface for native design authoring, version review, decision and Spec 224 handoff. The native-only path must deliver usable outcomes when every provider flag is false.

## Dependencies

- Depends on: Sections 02, 03 and 04.
- Blocks: Section 07.
- Do not create a public route or revive `/workflows`; select the exact authenticated product route only after inspecting existing navigation and authorization patterns.

## Tests first

Use focused React/Vitest jsdom tests adjacent to the selected product feature. Start with component states and route/auth guards before wiring mutations.

1. Native-only create, view versions, compare, select decision and handoff renders with provider flags false.
2. Cover empty, loading/generating, partial, success, validation error, service error, offline, unauthorized, provider unavailable/native fallback, stale decision/conflict, cancellation, unsaved change, recovery and retention/delete states.
3. Verify tenant/role-denied user cannot read or hand off another tenant artifact.
4. Test keyboard sequence, visible focus, semantic labels, live async announcements, selected/disabled/hover states and reduced-motion behavior.
5. Test responsive component behavior/overflow at canonical viewports; browser proof comes in Section 07.

## Implementation

1. Search existing UI first with targeted `rg` in `apps/web/client/src/components/` and `apps/web/client/src/pages/` for design/canvas/editor/review/compare/prompt-preview and authorization states. Record the closest pattern and reuse-or-diverge decision in the implementation record before drafting components.
2. Run Astryx discovery from the repository root before UI code: `npm run astryx -- build "design authoring review workspace"`, layout docs, and component/token docs for every selected element.
3. Add a SmartAIHub-owned feature surface using existing query/mutation/auth patterns. It consumes the Section 02 lifecycle API, Section 03 resolver output and Section 04 handoff adapter. Keep provider messaging informational and do not put provider client code in React.
4. Use Astryx components/wrappers and design tokens. No page-local global CSS, hard-coded colors/spacing, or raw `<div>`/`<span>` layout. Keep dense variants/revision history in list/table rows rather than card-wrapped list items; reserve cards for independent widgets.
5. Localize all user-facing states through existing translation patterns in Thai and English. Never render raw provider errors, credentials or untrusted design content as HTML.
6. Prevent product self-design from bypassing Spec 224 release, security, sensitive interaction, approvals, capability or evidence gates.

## UI/UX Contract

### Target User / JTBD
- Role: authenticated creator or product operator with project/tenant permission.
- Goal: request a native design, compare versions, record a decision, and send an accepted immutable version to the existing implementation authority.
- Entry point: authorized SmartAIHub product navigation selected from an existing authenticated surface.
- Success outcome: a selected version has visible digest/provenance/evidence and a confirmed or clearly rejected Spec 224 handoff.

### Existing Pattern Reference
- Searched (rg query used): `rg -n -i "(design|canvas|editor|review|compare|prompt preview|unsaved|offline)" apps/web/client/src/components apps/web/client/src/pages`.
- Found pattern(s): establish exact paths during the mandatory pre-edit search; record them in the implementation record.
- Decision: reuse by default.
- Reason: divergence is permitted only when the found pattern cannot represent immutable version/digest and handoff evidence; record that specific gap.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Authenticated design entry | Existing authorized product route | Add gated entry and data bootstrap |
| Request/editor workspace | New SmartAIHub feature component | Native request, validation, unsaved/recovery |
| Version/review list | New feature subcomponent | Immutable versions, compare, decision/provenance |
| Handoff confirmation | Existing dialog/panel pattern | Show exact digest/evidence and typed outcome |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| `DesignAuthoringWorkspace` | selected feature directory | state composition and focus flow | lifecycle queries/mutations, flags |
| `DesignVersionReview` | selected feature directory | list/compare/decision UI | canonical artifacts and resolver output |
| `DesignHandoffPanel` | selected feature directory | explicit handoff confirmation | Section 04 typed outcomes |
| SmartAIHub Astryx wrappers | existing/new owned wrapper directory | layout/control token boundary | approved Astryx components |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading/generating | named progress, controls safely disabled, live announcement | jsdom + browser |
| empty | native design CTA and contextual help | component test |
| error/offline | safe localized retry/recovery copy, no raw errors | component test |
| partial/provider unavailable | native result remains usable; provenance shown | component test |
| success | version, digest, decision and handoff availability visible | component test |
| unauthorized/conflict/stale | blocked action with reason and recovery path | component test |
| disabled/focus/hover/selected | visible state and keyboard equivalent | component test |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | single-column request/review, virtual keyboard and safe-area aware actions | browser screenshot |
| tablet 768x1024 | compact compare with explicit switching | browser screenshot |
| desktop 1440x900 | side-by-side review with stable action area | browser screenshot |
| small-mobile 360x800 | no clipped dense revision/decision controls | browser screenshot if dense layout used |
| laptop 1024x768 | compare panes collapse predictably | browser screenshot |
| wide-desktop 1280x800 | revision list and evidence panel retain readable density | browser screenshot |

### Accessibility Acceptance
- Keyboard path: create → validate → select version → compare → decide → handoff/cancel without pointer-only actions.
- Focus visibility: use component-provided focus styles and preserve logical focus after async completion/dialog close.
- Labels/semantics: labelled inputs, semantic revision list/table, decision state, and polite/assertive live regions appropriate to async errors.
- Contrast: use Astryx/theme tokens across light, dark, system and high-contrast supported modes.
- Reduced motion: respect existing preference and avoid progress animation that is required to understand status.

### Copy Contract
- Tone: concise, operational, transparent about native/provider provenance.
- Primary language(s): Thai and English through existing i18n keys.
- Required labels: create design, versions, compare, select, decision, evidence, handoff, cancel, retry, recovery, delete/retention.
- Validation/error copy: identify the failed field/action and safe next step; never surface raw provider detail.
- Empty/loading/success copy: explain native availability when provider integration is disabled.
- Localization/fallback notes: use established fallback; absent translations are logged, never embedded as one-off strings.

### Browser Evidence Required
- Follow `skills/orchestra/references/ui-browser-verification.md` for the native create/review/handoff flow at the six listed viewport cases where applicable, keyboard pass, focus and theme/locale states. If browser infrastructure is unavailable, record as unverified rather than passing it.

## Completion criteria

- A correctly authorized user can complete native authoring/review/handoff with provider flags false.
- UI meets all recorded state, responsive and accessibility requirements and consumes authoritative contracts only.
- No public/retired route, provider client, raw secret/error, global reset or raw layout styling is introduced.
