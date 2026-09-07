# Section 01: Candidate Recovery

Ownership: `verticalDramaStoryboardGeneration.ts` and its focused tests.

Implement a storyboard-only safety projection, three candidate-aware repair attempts, structured exhaustion metadata, and single final credit deduction. Start with failing tests and keep provider/schema retries unchanged.

Acceptance: safe oversized metadata does not trigger repair; each repair uses the prior candidate; successful recovery charges once; exhaustion charges zero and retains evidence.

## Implemented

- Added shot-local safety analysis over media/story-bearing fields, preventing aggregate episode size and duplicated handoff metadata from becoming false policy findings.
- Added three candidate-aware repair attempts. Each attempt receives the immediately preceding candidate without derived handoff duplication and includes the affected shot number.
- Added structured exhaustion error data and reapplied authoritative duration values after the accepted repair.
- Focused generator and safety regressions pass.
