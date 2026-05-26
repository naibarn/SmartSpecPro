# Orchestra Plan

## Task
Plan the Production Director enhancement so Media Studio shows four separate plan/storyboard concept cards, supports card-level regeneration, can generate realistic infographic previews inside each card, offers fullscreen preview, and stores project-level default image/video media models for downstream generation.

## Task Classification
- Scope: large
- Risk: medium
- Affected domains: frontend Media Studio UI, Production Director state, skill/LLM planner contract, media generation integration, tests
- Estimated file count: 8-12
- Chosen route: planning-only now; implementation should use visual-ui-flow + multi-agent waves or deep-plan-chain against existing Feature 116 artifacts
- Bug route: false
- Classification notes: This is a user-facing workflow extension over an existing Production Director implementation. It likely touches React UI, Media Studio orchestration state, shared production types, planner skill contract, media generation task wiring, and e2e/component tests.

## SocratiCode Preflight
- Status: active and green for `/home/dev/projects/SmartSpecPro`.
- Relevant files/symbols found:
  - `apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx`
  - `apps/web/client/src/pages/MediaStudio.tsx`
  - `apps/web/client/src/features/media-production/production-director.e2e.test.tsx`
  - `apps/web/skills/media-production-storyboard-planner/skill.md`
  - `specs/feature/116-production-director-node-canvas/spec.md`
  - `specs/feature/114-gemini-omni-suite-media-assets/sections/section-09-media-studio-production-director.md`
- Blast radius:
  - `ProductionWorkspace.tsx`: no reverse dependents reported by SocratiCode.
  - `MediaStudio.tsx`: no reverse dependents reported by SocratiCode.
- Current dirty work detected before planning:
  - `apps/web/client/src/features/media-production/components/ProductionWorkspace.tsx`
  - `apps/web/client/src/features/media-production/production-director.e2e.test.tsx`
  - `apps/web/client/src/pages/MediaStudio.tsx`

## Existing Fit
- `ProductionWorkspace` already has a `ProductionStoryConceptWizardState` with four options and a combined `Regenerate 4 concepts` action.
- `MediaStudio.runProductionPlanAndVerify` already calls `media-production-storyboard-planner` with `mode: "marketplace_story_concept_synthesis"` and requires four story dimensions:
  - `story_option:problem_solution`
  - `story_option:objection_trust`
  - `story_option:quick_demo`
  - `story_option:use_case_moment`
- `MediaStudio` already stores image/video/audio selected models in `ProductionGoal.tabSnapshots.selectedModels`.
- Generated workflow nodes currently default image/video generation snapshots from `tabStates.image.selectedModel || "auto"` and `tabStates.video.selectedModel || "auto"`.

## Product Design

### User Experience
Production Director should show a "Concept Board" after planning:

1. Four cards render as first-class alternatives, not a compact button grid.
2. Each card contains:
   - concept title and angle
   - hook
   - storyboard timeline
   - key selling/proof points
   - risk/readiness badges
   - infographic preview area
   - actions: select, regenerate this card, generate infographic, fullscreen
3. Regenerating one card preserves the other three cards and uses the card dimension as the LLM target.
4. Generating infographic creates a visual summary for that card using the existing image generation system, with a prompt that asks for a beautiful realistic infographic that helps the user understand the concept.
5. Fullscreen opens a focused review modal/lightbox with the infographic, storyboard timeline, prompt summary, risk badges, and create-workflow action.
6. The project-level model panel should include default image model and default video model selectors before workflow generation. These values seed every generated image/video node unless a node is manually overridden.

### UX Acceptance
- Users can understand the four creative directions without reading raw JSON.
- A user can regenerate only one weak card without losing the other three.
- A user can generate or regenerate a card infographic independently.
- A user can inspect the concept fullscreen before selecting it.
- The selected project image/video defaults are visible before plan creation and are persisted with the Production project.
- Generated nodes use the project defaults, not an unrelated currently active tab model.

## Data Contract Plan

### Extend `ProductionStoryConceptOption`
Add optional visual generation fields:

```ts
infographicPrompt?: string;
infographicTaskId?: string;
infographicUrl?: string;
infographicStatus?: "idle" | "prompt_ready" | "generating" | "ready" | "failed";
infographicError?: string;
infographicGeneratedAt?: string;
infographicModelId?: string;
```

### Add Project Generation Defaults
Prefer a small shared type under `@shared/mediaProduction`:

```ts
generationDefaults?: {
  imageModelId?: string;
  videoModelId?: string;
  imageModelSource?: "project_default" | "media_tab" | "system_default";
  videoModelSource?: "project_default" | "media_tab" | "system_default";
};
```

Persist it in `ProductionSpace` or `ProductionPlanningSelection.contextPack` and mirror it in `ProductionGoal.tabSnapshots.selectedModels`.

### Planner Skill Output
Ask `media-production-storyboard-planner` to return, per concept:

```json
{
  "infographic_prompt": "Create a polished realistic infographic...",
  "visual_summary": "...",
  "key_visual_elements": ["..."],
  "storyboard_thumbnail_notes": "..."
}
```

The prompt must prohibit unsupported product claims and require visible evidence-safe language.

## Implementation Waves

### Wave 1: Types and State Contract
- Extend shared production types for concept infographic fields and project generation defaults.
- Update local normalizers/parsers in `MediaStudio.tsx` to preserve these fields.
- Add helper selectors for default image/video model resolution:
  - project default
  - selected media tab model
  - system/model auto fallback

### Wave 2: UI Concept Cards
- Refactor the existing story wizard card grid into a dedicated `ProductionConceptCard` or `ProductionConceptBoard` component.
- Each card owns independent actions:
  - `onRegenerateStoryConcept(conceptId)`
  - `onGenerateConceptInfographic(conceptId)`
  - `onOpenConceptPreview(conceptId)`
- Add loading/failed/ready visual states for infographic preview.
- Add fullscreen dialog using existing dialog/lightbox patterns.

### Wave 3: LLM and Image Generation Wiring
- Add card-level regeneration path in `runProductionPlanAndVerify` or a sibling callback.
- For infographic generation, use the existing media image generation path instead of adding a new provider.
- Build prompt from concept + storyboard + product truth:
  - "Create a beautiful realistic infographic with photorealistic supporting imagery..."
  - include card title, hook, timeline, product-safe proof points, audience, platform
  - ask for readable visual hierarchy and no fabricated claims
- Save resulting `taskId`/URL back onto the matching concept card.

### Wave 4: Project Default Media Models
- Add image/video model selectors in the planning/model context panel.
- Default values should come from current Media Studio selected image/video models, but become explicit project-level defaults once saved.
- Use these defaults when creating generated image/video node `configSnapshot.config.model`.
- Add validation so image nodes cannot accidentally receive a video model and video nodes cannot receive an image model.

### Wave 5: Tests and Browser Evidence
- Update `production-director.e2e.test.tsx`:
  - renders four card-style concepts
  - regenerates one card only
  - starts infographic generation for one card
  - opens fullscreen preview
  - project image/video defaults render and feed node config snapshots
- Run TypeScript/Vitest checks for changed files.
- For final implementation, run browser/visual checks at mobile 390x844, tablet 768x1024, desktop 1440x900.

## UI/UX Contract

### Target User / JTBD
- Role: creator, marketer, product seller, video production operator
- Goal: compare four creative directions quickly and choose the best concept before building a workflow
- Entry point: Media Studio -> Production
- Success outcome: selected concept has clear storyboard, visual idea, project default media models, and can generate a workflow safely

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Production Director | `ProductionWorkspace.tsx` | four concept cards, infographic preview, fullscreen modal, model defaults |
| Media Studio orchestration | `MediaStudio.tsx` | card-level regeneration, image generation wiring, default model resolution |
| Planner skill | `apps/web/skills/media-production-storyboard-planner/skill.md` | infographic prompt output contract |
| Tests | `production-director.e2e.test.tsx` | card/action/model default coverage |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | card action spinner, disabled duplicate action | component test |
| empty | no infographic preview, clear generate image action | component test |
| error | card-level error and retry | component test |
| success | image preview visible, fullscreen opens | component + browser |
| disabled/focus/hover | keyboard focus visible, icon buttons labelled | a11y/browser |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | cards stack, actions remain reachable, fullscreen uses full viewport | browser screenshot |
| tablet 768x1024 | two-column card grid where space allows | browser screenshot |
| desktop 1440x900 | four cards fit without cramped text/overlap | browser screenshot |

### Accessibility Acceptance
- Keyboard path: tab through card actions, select, regenerate, generate image, fullscreen, close.
- Focus visibility: every icon/action button has a visible focus ring.
- Labels/semantics: card action buttons have accessible labels in Thai/English.
- Contrast: infographic placeholders and badges must pass common contrast expectations.
- Reduced motion: no required animation for understanding.

## Quality Gates
- `cd apps/web && pnpm test -- production-director.e2e.test.tsx`
- `cd apps/web && pnpm check`
- Browser/manual evidence for `/media-studio` Production tab at mobile/tablet/desktop after implementation.

## Open Product Question
Should infographic generation happen automatically after the four concepts are created, or should each card wait for the user to click "Generate infographic" to control credits?

Recommended default: manual per-card generation first, with an optional "Generate all 4" action later.
