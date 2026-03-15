## Research Notes

### What the current system already does well

- Component recipes exist and Draft with AI can choose among multiple built-in recipe families.
- Component slot bindings are shared between client and server.
- AI preview, custom blocks, and canonical preview infrastructure already exist.
- Media/image/video slots and structured block authoring are already usable in the editor.

### What the code reveals about the current gap

#### 1. Narrative input is still too large for compact recipes

In [aiPresentationService.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts):
- body lines can still reach 10 entries
- each body/detail line can reach 260 chars
- sections can still contain 4 details each

This means the layout system often receives content that is already too dense for compact blocks.

#### 2. Suitability checks are still too coarse

In [aiPresentationService.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/aiPresentationService.ts), `getRelayoutRecipeSuitability()` mainly checks:
- body count
- section count
- note length
- long line count

This is better than nothing, but still not enough for:
- paragraph-heavy Thai copy
- mixed paragraph + bullet slides
- section-dense educational content
- text-heavy profile/resume/info-board slides

#### 3. Slot binding still relies too much on truncation

In [componentRecipeSlotBindings.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/presentation/componentRecipeSlotBindings.ts):
- many slots are still populated by picking the first available line
- many outputs still end with `.slice(0, N)`
- there is no recipe-specific semantic rewrite pass before slot assignment

This is the most direct cause of “looks random / crowded / cut off”.

#### 4. The system lacks long-form block families

Current built-ins cover:
- process
- timeline
- feature highlights
- infographic grid
- stat cards
- profile summary
- quote callout
- video spotlight
- poster spotlight
- framed image story
- photo collage

These are still mostly compact or medium-density layouts.

What is missing:
- article/report style blocks
- multi-section explanatory layouts
- resume/profile boards with denser text structure
- FAQ / editorial / reference-heavy layouts

#### 5. There is no explicit layout mode router yet

The current pipeline can choose recipes, but it does not yet formally choose between:
- structured editable block mode
- long-form structured mode
- flexible DSL layout mode
- full-slide generated-media mode

That missing router is the key architectural gap.

## Implications

1. Visual variety alone will not fix quality.
2. The next upgrade must happen before final slot binding, not only in rendering.
3. LLM should help with semantic compression, but deterministic fit validation must stay in the loop.
4. Full-slide media should be a selective mode, not the default for all slides.

## Recommended Direction

Use a multi-mode pipeline:

1. content profiler
2. mode router
3. recipe-aware LLM compaction
4. deterministic fit engine
5. fallback orchestrator
6. quality gate

## Primary Technical Risks

- Too much LLM freedom causes unstable outputs
- Too much local truncation causes ugly outputs
- Long-form support without mode routing will still misclassify slides
- Full-slide media mode can reduce editability if overused

## Recommendation

Build the next planning unit around:
- long-form block family
- markdown content profiler
- LLM compaction contract
- overflow fallback system
- constrained DSL mode
- full-slide media mode
