# Initial Completeness Review

## Verdict

The spec captures the required shift from form-based Production Director to node-based Production Space.

## Critical Points Covered

- Production tab must be exclusive and must not render Image/Video/Audio controls underneath.
- Goal-first brief is separated from provider prompt generation.
- Library/search panel adds character search.
- Drag/drop assets become typed context assets.
- Planning is performed by selectable skills.
- LLM receives a structured context pack with available system capabilities.
- React Flow canvas is the main plan review/edit surface.
- Users can edit nodes/edges before approval.
- Node catalog now separates planning/script, image, video, TTS, music, sound effects, voice changer, QA, Storyboard Review, and Video Edit handoff nodes.
- Video Shot workspace now sits between Production and Image/Video/Audio so one storyboard shot can own its own cast, product, audio intent, visual intent, and child node graph.
- `video_shot` group nodes make the production canvas readable at story level while still allowing deep per-shot configuration.
- Each executable node requires an isolated config snapshot so many image/video/audio nodes can coexist without overwriting one another.
- Planning and verification do not reserve provider-generation credits.
- Approved output can route to Storyboard Review and Video Edit.

## Implementation Risks To Watch

- Current MediaStudio page is large; implementation should extract Production workspace components instead of expanding the monolith further.
- Drag/drop must not be the only path; click-to-add is required for accessibility.
- Canvas data must be durable and versioned, not only UI state.
- Skill schemas must be updated before UI assumes node/edge output.
- Verifier must validate canvas graph correctness, not just story text.
- Target tabs need an explicit `Save to Node` mode so configuring a node does not accidentally mutate global tab state or spend credits.
- Shot-level replanning must preserve manually edited child node configs unless the user explicitly accepts overwrite.
