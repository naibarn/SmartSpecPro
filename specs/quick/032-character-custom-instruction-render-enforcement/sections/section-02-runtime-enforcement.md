# Section 02 — Runtime Enforcement

Ownership: `verticalDramaCharacters.ts` and the runtime lowercase Character Visual Bible `skill.md`.

Implement the pure prompt builder and wire it to preview return/snapshot and the final provider submission. Preserve legacy behavior with no brief. Strengthen skill wording only where needed; do not duplicate its long examples.

Acceptance: section-01 tests pass, all related tests remain green, TypeScript passes, and the provider prompt contains exactly one owned block.

Coordination: no DB/API/UI-layout changes. Final submission is the authoritative enforcement point.

## Implementation evidence

- Added `buildCharacterRenderPrompt`, a bounded, JSON-encoded, replaceable requirement envelope with stable owned markers.
- Applied the same render prompt to preview output, approved snapshot, fallback generation, and approved-prompt generation.
- Preserved the base prompt byte-for-byte when no custom instruction is present.
- Kept identity/reference locks, child safety, and provider safety authoritative over conflicting brief details.
- The lowercase runtime `skill.md` was intentionally unchanged: its custom-instruction contract was already explicit, so the missing reliability boundary belonged in the router submission path.
- Verification: 189/189 related tests pass. A fresh full `apps/web` TypeScript check is currently blocked by unrelated pre-existing errors across editor/UI code and duplicate dependency typings in the shared dirty worktree; none point to the two changed router/test files.
- The repository-wide skill artifact audit remains red only for unrelated pre-existing `.venv`, `.pytest_cache`, and `__pycache__` artifacts in deep-planning skills; no unrelated cleanup was performed.
