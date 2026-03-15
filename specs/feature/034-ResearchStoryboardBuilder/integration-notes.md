# Integration Notes

## Accepted and auto-applied

### R3 - Preview lifecycle and retries

Accepted. The implementation plan now defines explicit preview lifecycle states, expiration handling, and stable commit tokens or idempotency keys.

### R4 - Python/Node contract normalization

Accepted. The implementation plan now requires a canonical run response contract and contract tests for structured and text-only cases.

## Pending user decision

### R1 - Commit target for saved research and storyboard outputs

Accepted. Confirmed research reports and storyboards will be saved as library-backed artifacts in Phase 1, with `agency_run_artifacts` acting as the run/provenance index.

### R2 - Canonical deck preview payload shape

Accepted. Deck preview payloads will use `AIPresentationSlide[]` plus deck-level metadata, with commit-time translation through the existing layout and presentation pipeline.
