# Section 06 — Footage, B-roll, and Assembly

## Objective

Support semantic scene/reference/B-roll bindings, creator video footage segments, exact timeline validation, audio/fit/disclosure policy, and deterministic assembly projection without overloading image shot references.

## Dependencies

- Sections 01–04.
- Existing shot-reference service/table, episode router/page/workspace, verticalDramaAssembly.ts, verticalDramaEpisodeVideoAssembly.ts, managed storage authorization, and Remotion/ffmpeg boundaries.

## Ownership

- Keep verticalDramaShotReferences.ts image/reference-only; add typed source-slot/scene-anchor resolution without adding video timeline rows.
- Add apps/web/server/services/verticalDramaBrollService.ts.
- Extend verticalDramaAssembly.ts and verticalDramaEpisodeVideoAssembly.ts with typed B-roll projection while preserving generated clip ordering/storage checks.
- Extend verticalDramaEpisodes.ts with B-roll procedures and verticalDramaSeries.ts with source-slot/scene-anchor procedures where ownership belongs.
- Add focused client components under apps/web/client/src/components/verticalDramaSeries/ and integrate VerticalDramaEpisodePage.tsx, VerticalDramaEpisodeWorkspace.tsx, or VerticalDramaStoryboardPanel.tsx without parallel writers.
- Add server/client/assembly tests.

## Binding rules

scene_anchor is the sole environment/start-frame promotion path and requires explicit user action. reference is an image conditioning path. b_roll_still uses an image with explicit display duration. b_roll_footage uses one exact source video segment with in/out and cannot be represented by a reference row.

Every binding stores snapshot ID/revision/fingerprint, slot/source/media/segment IDs, segment revision, order, duration or in/out, fit/crop policy, audio policy, disclosure/attribution label, and status. Reject missing storage, stale segment revisions, invalid bounds, rights/disclosure blocks, cross-tenant assets, out-of-order or over-budget timelines.

Assembly preserves exact video in/out, still display duration, deterministic order, audio policy, safe-area fit/crop, and visible labels. Partial assembly results are recoverable and never delete canonical source media. Generated motion clips remain primary episode clips; B-roll is an explicit projection.

## UI/UX Contract

### Target User / JTBD

- Role: episode editor.
- Goal: select the correct visual role and place real/AI media into a shot without hidden semantic conversion.
- Entry point: shot detail/reference/start-frame/B-roll controls.
- Success outcome: the editor sees anchor/reference/still-B-roll/footage-B-roll and previews exact timing before assembly.

### Existing Pattern Reference

- Reuse VerticalDramaStoryboardPanel reference picker, VerticalDramaEpisodeWorkspace scene-continuity controls, existing media upload/history cards, and assembly readiness/error presentation.
- Decision: reuse picker/card language but diverge in the footage editor with scrubber/in-out/audio controls because image reference UI cannot represent a timeline safely.

### Surface Inventory

| Surface | Change |
|---|---|
| shot media picker | group candidates by role and modality |
| footage editor | poster/video, metadata, scrubber, in/out, audio policy |
| B-roll timeline | order, duration, overflow, disclosure |
| assembly readiness | stale/storage/rights findings |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| VerticalDramaShotVisualSourcePicker | client/src/components/verticalDramaSeries/ | role-grouped source selection | source candidate query |
| VerticalDramaFootageSegmentEditor | same | player, metadata, in/out, audio | source metadata/segments |
| VerticalDramaShotBrollTimeline | same | order, duration, overflow, disclosure | binding projection |
| episode integration | episode page/workspace | selected shot and mutations | child callbacks |

### State Matrix

Cover metadata loading, empty source pool, unsupported/corrupt media, ready/selected, invalid segment, stale/rights blocked, audio conflict/overflow, upload retry, successful binding, and partial assembly. Blocked states show correction actions and never silently drop media.

### Responsive Matrix

Use mobile 390x844 stacked player/fields with horizontal timeline scrolling, tablet 768x1024 collapsed columns, desktop 1440x900 player/details/timeline columns, and extended small-mobile 360x800/laptop 1024x768/wide-desktop 1280x800 checks.

### Accessibility Acceptance

Keyboard role selection, numeric in/out, non-scrubber alternatives, reorder/remove buttons, labelled player, visible focus, text status equivalents, no color-only semantics, reduced motion.

### Visual/token direction

Reuse existing storyboard/media/assembly tokens and primitives, maintain balanced operational density, and avoid raw hex/global resets.

### Copy Contract

Thai-first with English fallback: “ฉาก/บรรยากาศ”, “ภาพอ้างอิง”, “ภาพ B-roll”, “วิดีโอ B-roll”, “จุดเริ่ม”, “จุดจบ”, “เสียงต้นฉบับ”, “ปิดเสียง”, “สื่อไม่พร้อม”, “ช่วงเวลาไม่ถูกต้อง”, “แหล่งข้อมูลล้าสมัย”.

### Browser Evidence Required

Upload/choose real photo as still B-roll, choose real video and bind exact segment, attempt image-as-scene conflict, stale segment, overflow, audio conflict, and successful assembly readiness at required viewports.

## Tests-first requirements

Test image reference/video B-roll separation, explicit scene-anchor promotion, exact segment bounds/revision, storage/owner/rights/disclosure rejection, deterministic ordering/duration/audio/fit, provider URL exclusion, recoverable partial assembly, and client timeline states.

## Acceptance

- Video footage is first-class and exact segment boundaries survive assembly.
- Image/reference table is not overloaded.
- Scene anchor, reference, still B-roll, and footage B-roll are visibly and server-side distinct.

## Implementation record

- Added `verticalDramaBrollService.ts` for role separation, exact footage bounds/revision validation, stale snapshot rejection, still duration checks, and deterministic timeline projection.
- Added `bindShotBroll` and `validateShotBrollTimeline` episode procedures writing only to `vertical_drama_shot_broll_bindings`; image references remain owned by `verticalDramaShotReferences`.
- Added `VerticalDramaFootageSegmentEditor.tsx` for exact in/out, audio policy, invalid-range, and save states.
- Existing Story Sources & Media already admits creator image/video uploads through managed media paths; generated references remain explicitly reference/illustrative.
