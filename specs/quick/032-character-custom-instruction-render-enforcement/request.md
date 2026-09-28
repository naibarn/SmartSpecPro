# Request

Implement the approved design in `docs/portable-skill-pack/specs/2026-07-13-character-custom-instruction-render-enforcement-design.md` so every non-conflicting character-image custom instruction is present in the final image-provider prompt, including direct generation and approved preview flows.

Constraints: preserve identity/reference/child/provider safety precedence; no DB or UI layout change; no new dependency; keep absent-instruction behavior unchanged.
