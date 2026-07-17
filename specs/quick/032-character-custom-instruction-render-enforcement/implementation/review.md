# Review record

## Round 1

Reviewed the helper boundary, preview snapshot consistency, fallback path, approved-prompt path, provider payload, marker injection handling, and no-brief compatibility. Corrected stale procedure comments that described the image call as synchronous. No behavior defect remained after the focused tests.

## Round 2

Re-read the final diff after comment corrections and checked the custom-instruction test suite against the production Thai reproduction. No material finding remained. The change is scoped to prompt construction and tests; no DB, API shape, UI layout, dependency, or persistent Character DNA changes were introduced.
