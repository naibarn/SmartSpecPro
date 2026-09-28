# Request

Implement the approved Vertical Drama Barrier Multi-View design from:
`docs/portable-skill-pack/specs/2026-08-09-vd-barrier-multi-view-design.md`.

The required production flow is:

- Start frame slot: Irin inside the cafe storage room.
- Reference frame slot: Krit outside the storage-room door in the cafe lower floor.
- Video prompt/render: attach both views with stable roles and generate a timed multi-shot cut plan from explicit speaker-to-side mapping.
- Do not interpret the outside actor as a phone/video-call Caller.
- Preserve a legacy read path for the previously implemented single-image `barrierDialogue`, but do not treat it as production-ready without a generated/linked outside reference frame.

Constraints:

- Preserve unrelated dirty-worktree changes.
- Prefer existing JSONB start-frame plan and `vertical_drama_shot_references` infrastructure; avoid a new table unless required.
- Keep tenant/user ownership checks on all new mutations and reference links.
- Use paired skill files byte-identically.
- Focused tests are required; repository-wide baseline failures must be separated from scoped results.
