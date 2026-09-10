# Code Review: Section 02 — Provider Routing and Verification

Date: 2026-09-09
Reviewer: inline conductor review (the read-only review subagent timed out and was closed)

## PASS

- The generic provider resolver already selects the alternate model only for a non-empty reference-image list, so no global provider change was necessary.
- New tests cover both Flare and Sunburst, with and without references, exact selected Kie operation IDs, and the `input_urls` array payload.
- Natural-language hints for explicit Flare/Sunburst names are checked before the legacy GPT Image 2 fallback.
- Tests use mocks and do not make paid Kie requests.

No MUST_FIX findings.
