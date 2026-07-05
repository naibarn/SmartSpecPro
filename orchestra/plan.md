# Orchestra Plan

## Task
Four related fixes/features to the Vertical Drama Series character + storyboard
system, requested together after prior rounds left the "swap/reference a
character's existing images from the Storyboard page" experience incomplete:

1. From the Storyboard/Episode page, changing a shot's character reference
   image should show that SPECIFIC character's own already-generated images
   (not a blank Library/History search).
2. Each shot must correctly show which character(s) it uses, which image was
   chosen for each, be changeable from what already exists, and also accept a
   dragged-in replacement.
3. Add a "generate full-spec Character Sheet" option in the character tab —
   one infographic-style image (turnaround + expressions + outfit variations +
   stats), English text except the character's own name, attaching the
   character's existing portrait for identity lock. Optionally selectable
   language.
4. Add a persistent right-side panel (not a popup) in the Episode/Storyboard
   view for pulling images from the character tab's history — matching the
   character tab's own layout.

## Why this is being re-planned (root-cause of "never complete")
The previous round built (1) character-reference chips per shot (correctly
mapped via `required_character_refs`) and (2) a swap mechanism — but the swap
dialog only offered a generic Library/History/Grid-cutter search, never the
character's OWN existing asset gallery, and stayed a modal Dialog instead of
the requested persistent panel (explicitly deferred, then asked for again —
this is the second time). This plan closes both gaps directly instead of
deferring them again.

## Classification
- scope: large (new generation capability + cross-cutting UI restructure
  spanning the character tab and the episode/storyboard page, backend +
  frontend)
- risk: medium (one new paid image-generation mutation reusing an
  already-proven pattern; a UI layout restructure with no auth/security
  surface; no schema changes)
- affected_domains: frontend (character tab, episode page, shared reference
  panel), backend (characters router, character stock service, character
  image-generation service)
- estimated_file_count: 8-9
- chosen_route: direct/inline conductor implementation once confirmed (no
  proven need for parallel sub-agents — the four sections touch overlapping
  files in a specific dependency order, better done sequentially by one
  conductor than risking merge conflicts across agents)
- task_summary: Let the Storyboard page reuse each character's own image
  history for swaps, always visible in a side panel, and add a full-spec
  character-sheet generation mode.
- parallel_default: false
- planned_agents: [] (conductor direct implementation)
- dispatch_preference: direct-standard-light

## Research findings (grounding this plan in actual code, not assumption)

- **No per-character asset-list endpoint exists**, but `verticalDramaCharacters.getManifest`
  (`server/routers/verticalDramaCharacters.ts:265-273`) already returns EVERY
  asset for the whole series (`assets[]`, each with `characterId`,
  `mediaAssetId`, `role`, `state`, `thumbnailUrl`, etc. —
  `shared/verticalDramaSeries/characterAssets.ts:52-70`). The character tab
  itself already gets "this character's assets" by client-side filtering
  (`assets.filter(a => a.characterId === selectedCharacterId)`,
  `VerticalDramaCharacterStockPanel.tsx:673`). No new backend endpoint is
  needed for section 1/2/4 — just fetch the manifest from the episode page too
  and filter the same way.
- The existing per-asset gallery row (`VerticalDramaCharacterStockPanel.tsx:1467-1627`)
  — thumbnail, role/state badges, approve/reject buttons — is the visual
  pattern to copy for the new "pick this image" gallery, swapping the
  approve/reject buttons for a single "ใช้ภาพนี้" (Use this image) action.
- `VerticalDramaCharacterReferencePanel.tsx` (the Library/History/Grid-cutter
  picker already reused for shot-image and character-portrait swaps) uses a
  Radix `Tabs` with a 3-column `TabsList` (`:394-411`) driven by
  `useState<"library"|"history"|"cutter">`. Adding a 4th tab
  ("ภาพของตัวละครนี้" / This character's images) is a contained, well-understood
  change: extend the union type, `grid-cols-3` → `grid-cols-4`, one new
  `TabsTrigger` + `TabsContent`.
- `generateCharacterImage`/`generateCharacterTurnaround` already attach the
  character's existing primary portrait as an identity-lock reference
  (`server/routers/verticalDramaCharacters.ts:826-833`, `:1084-1091`) — this
  same convention will back the new character-sheet generation.
- **Key discovery for section 3**: the `vertical-drama-character-visual-bible`
  skill already computes `full_body_prompt`, `expression_sheet_prompt`, and
  `outfit_sheet_prompt` per character (schema fields exist today) — but only
  `primary_portrait_prompt` and `turnaround_prompt` are ever read
  (`server/services/verticalDramaCharacterImageGeneration.ts:181-196`,
  `:281-288`). The other three are computed by the LLM and silently discarded.
  This means section 3 does NOT need a new skill/LLM call design — it needs to
  (a) stop discarding those 3 fields, and (b) combine all of them (portrait +
  turnaround + expressions + outfit) into one structured multi-panel image
  prompt, the same way the already-shipped, already-verified 3x3 multi-angle
  grid combines 9 angles into one image.
- The character's `data` JSON (`VerticalDramaCharacter` type,
  `shared/verticalDramaSeries/contracts.ts:69-86`) has NO `age`/`occupation`/
  `height`/`weight` fields today — only `personality`, `backstory`,
  `identityLock`, `wardrobeRules`, `approvedReferenceAssetIds`,
  `currentState`. The reference character-sheet images the user attached show
  those stat fields. Two options: (a) let the LLM invent plausible sheet
  labels from `personality`/`wardrobeRules`/`backstory` text without adding
  new structured fields (fast, no schema change), or (b) add `age`/`occupation`
  fields to character creation so the sheet can show real, user-set values
  (more accurate, needs a small schema/form addition). **Decision needed —
  see "Open decisions" below.**

## Section A — Character's own image gallery, reachable from every shot (points 1, 2, 4)

**Files:** `VerticalDramaCharacterReferencePanel.tsx`, `VerticalDramaEpisodePage.tsx`, `VerticalDramaStoryboardPanel.tsx` (no change needed — already wired to open the swap target correctly).

1. Add a 4th tab, "ภาพของตัวละครนี้" (This character's images), to
   `VerticalDramaCharacterReferencePanel.tsx`. Fetch
   `trpc.verticalDramaCharacters.getManifest.useQuery({seriesId})` inside the
   panel, filter `assets` by the panel's own `characterId` prop (finally made a
   REAL prop instead of the current dead/unused one — this requires
   `VerticalDramaEpisodePage.tsx` to always pass the real target character's id,
   which for the `startFrame` swap case means resolving which character(s) that
   shot needs and defaulting to the first one, or showing a small
   character-selector row above the gallery when a shot has 2+ characters).
   Render each asset using the copied gallery-row pattern from
   `VerticalDramaCharacterStockPanel.tsx:1467-1627` (thumbnail + role/state
   badge), with a single "ใช้ภาพนี้" button per row calling
   `onLinkMediaAssetId(asset.mediaAssetId)` directly (no re-resolve needed —
   it's already a canonical `media_assets` id, unlike Library/History items).
2. Make this new tab the DEFAULT selected tab whenever the panel opens for a
   character that already has at least one approved/generated asset (Library
   tab stays default only when the character has nothing yet) — directly
   satisfies "แสดงภาพที่มีของตัวละครนั้น ๆ" ("show images that already exist for that
   character") as the first thing seen, not something the user has to click
   into.
3. Drag-and-drop replace (already partially supported by the panel's existing
   Library/History drop zone) — confirm the SAME drop zone accepts a drag
   directly onto a shot's character chip in `VerticalDramaStoryboardPanel.tsx`
   too (not just onto the open panel), reusing the existing
   `application/x-smartspec-media-type` drag contract already standardized
   across this codebase (Media Studio, Storyboard Review, the character tab).
4. **Persistent panel (point 4), replacing the current modal Dialog:**
   Restructure `VerticalDramaEpisodePage.tsx`'s top-level return into a
   2-column layout once a storyboard exists —
   `grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]` (mirrors the exact
   breakpoint/column-width convention `VerticalDramaEpisodeWorkspace.tsx`
   already uses for its own advanced-section layout, for visual consistency).
   Left column: everything the page renders today (breadcrumb, workspace,
   repair dialog, contact-sheet picker). Right column: the reference panel,
   ALWAYS mounted (not gated behind `imageSwapTarget != null`) —
   - Shows an empty/idle state ("เลือกช็อตหรือตัวละครเพื่อเริ่มเปลี่ยนภาพ" — pick a
     shot or character to start swapping) when `imageSwapTarget` is null.
   - Shows the real gallery/Library/History/cutter content the instant a shot's
     "Change image" or a character chip is clicked — no popup, updates in
     place.
   - Below `xl` breakpoint (tablet/mobile), fall back to the current
     Dialog-based modal so the feature stays usable on narrower screens
     instead of being silently dropped — this is a responsive fallback, not a
     scope cut; the picker content and behavior are identical, only the
     container differs by viewport width.

## Section B — Full-spec Character Sheet generation (point 3)

**Files:** `verticalDramaCharacterImageGeneration.ts`, `verticalDramaCharacters.ts` (router), `VerticalDramaCharacterStockPanel.tsx`.

1. Extend `GenerateCharacterVisualPromptsResult` to also surface
   `fullBodyPrompt`, `expressionSheetPrompt`, `outfitSheetPrompt` (currently
   parsed by the schema but dropped before being returned to callers).
2. New async mutation `generateCharacterSheet` in `verticalDramaCharacters.ts`
   (mirrors `generateCharacterImage`'s structure exactly: rate limit → run or
   reuse `generateCharacterVisualPrompts` → credit check/reserve → submit →
   return `{taskId, ...promptMeta}`):
   - Builds ONE combined prompt instructing a structured multi-panel
     character-sheet layout: a portrait panel, a 3-pose turnaround
     (front/side/back) using `turnaroundPrompt`, an expression grid using
     `expressionSheetPrompt`, an outfit-variation row using
     `outfitSheetPrompt`, plus a compact stats sidebar built from the
     character's real `name`/`role`/`personality`/`wardrobeRules` text.
   - Explicit instruction: "all text labels in English; the character's name
     must appear exactly as given: '<name>'" (name is NOT translated/altered,
     since Thai-named characters must keep their real name on the sheet).
     Optional `sheetLanguage: "en" | "th"` input (default `"en"`) toggling
     whether the STATS TEXT itself (not the name) renders in English or Thai
     — see open decision below.
   - Attaches the character's existing primary portrait as
     `referenceImageUrls` for identity lock, same as the other two mutations.
   - Same async submit+poll+finalize convention already shipped for start-frame
     images/multi-angle grids/character portraits: returns `{taskId}`, client
     polls `media.getTask`, finalizes via `resolveMediaAssetForImport` +
     `linkAsset` (new `role: "character_sheet_full"`, keeping the existing
     `"character_sheet_turnaround"` role for the simpler multi-angle-only
     sheet, unchanged).
3. Frontend: new "สร้าง Character Sheet แบบเต็ม" (Generate full character sheet)
   button in `VerticalDramaCharacterStockPanel.tsx`, next to the existing
   portrait/turnaround buttons — confirm-gated (real, likely higher-than-single-image
   cost, matching the multi-angle grid's `numImages: 2`+ pricing tier), poll,
   finalize, and cache into the panel's existing generated-asset display
   pattern.

## Sequencing (single conductor, sequential — no proven parallel-safe split)

1. Section B backend (prompt-result extension + new mutation) — independent
   of Section A, do first since it's the more novel/riskier piece and
   benefits from being verified early.
2. Section A backend-adjacent work: none required (manifest already exists) —
   go straight to frontend.
3. Section A frontend: 4th tab in the reference panel, default-tab logic,
   persistent-panel layout restructure in the episode page.
4. Section B frontend: character-sheet button + poll + finalize wiring.
5. Verification: `pnpm check`, relevant Vitest suites, `pnpm build` + service
   restart, LIVE generation test for the character sheet (submit real task,
   poll to completion, visually inspect the result the same way the 3x3
   multi-angle grid was verified last round — do not claim success without
   seeing a real generated image).
6. Orchestra post-completion review + progress/decisions update + final
   Thai-language summary.

## Open decisions (need your confirmation before implementation starts)

1. **Character sheet cost/scope**: keep the existing simple "character sheet"
   (turnaround-only) button AS-IS and add the new full-spec sheet as a SECOND,
   separate button — recommended, since the turnaround-only one is cheaper
   and faster for quick iteration, while the full sheet is a bigger, pricier
   asset. Confirm this is fine, or say if you want the old button replaced
   entirely.
2. **Sheet stats fields**: without adding `age`/`occupation`/`height`/`weight`
   to the character data model, the LLM will INVENT plausible-looking stat
   text for the sheet's sidebar (consistent with personality/wardrobe, but not
   backed by a real stored value). Adding those fields to character
   creation is possible but is its own small scope addition (form + schema
   field, no migration needed since `data` is a flexible JSON column) —
   confirm whether to add real stat fields now, or accept LLM-invented stats
   for this round (can be added later without breaking anything).
3. **Sheet language**: text in English by default, character name always
   exactly as given, with an optional `sheetLanguage` toggle for the stats
   text specifically — confirm this default, or specify a different default.
4. **Persistent panel responsive fallback**: confirm it's acceptable for the
   permanent side panel to only appear at `xl` breakpoint and above, with the
   existing modal Dialog kept as the fallback on smaller screens (rather than
   trying to force a permanent side panel on mobile widths, which would
   crowd out the shot list).

If no response is given, I will proceed with the recommended defaults above
(separate button, LLM-invented stats this round, English default with
optional toggle, `xl`-and-above persistent panel) rather than blocking on
these — they are all safely reversible/extendable later.
