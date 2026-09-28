# Feature 173 Spec Review — Round 1

**Reviewer:** Main Codex conductor
**Date:** 2026-09-01
**Scope:** Cross-check the new prompt-variant design against the current
Vertical Drama prompt editor, durable job flow, Feature 170 multimodal media
contract, and the requirement that Legacy remain unaffected.

## Findings and disposition

| Check | Finding | Disposition |
|---|---|---|
| Legacy compatibility | `clip.prompt` is still consumed by existing render/QC paths. | Closed: active projection remains source-compatible and Enhanced never writes it before Apply. |
| Same editor UX | A second textbox would duplicate edit state and create ambiguity. | Closed: one editor plus Legacy/Enhanced selector and explicit Apply. |
| Split shots | Existing generation is shot-level but can persist multiple clip mappings. | Closed: both actions are shot-level; variant result maps exact clips. |
| Full prompt semantics | Replacing only positive text could leave dialogue/audio/model metadata mismatched. | Closed: variants store and apply the full bundle. |
| Race safety | Legacy and Enhanced jobs can complete out of order. | Closed: variant/engine job identity, fresh merge, CAS/row lock, and task guard. |
| Media models | Image and video capabilities are not interchangeable. | Closed: image, authoring, and video model IDs are separate; shared connection is optional only. |
| Provider correctness | An Agent could hallucinate provider support. | Closed: exact target video-model profile is server-owned and compiler-validated. |
| Runtime readiness | The target package SDK/manifest currently has readiness gaps. | Closed: Enhanced gate blocks with diagnostics and forbids silent Legacy fallback. |
| Cost safety | Two buttons could accidentally double-spend. | Closed: separate confirmation, idempotency, one active generation per shot by default, and cost display. |
| Future extensibility | A flat alternate string would not support A/B, provenance, or model changes. | Closed: versioned full-bundle variants with fingerprints and skill/model provenance. |

## Result

No MUST_FIX findings remain for the design scope. The document is ready for user
review. Implementation remains blocked by the brainstorming approval gate.
