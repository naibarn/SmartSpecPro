# Verification and Reporting

Verify **the claim being made**, not a larger unrelated milestone.

- A development checkpoint needs only actual repository-required checks and appropriate affected-scope evidence. Record its integrated canonical SHA.
- A functional preview needs a build/runtime identity and observable result from the actual development environment.
- Final SPEC acceptance needs its own required test/UAT evidence; an earlier implementation or merge is not acceptance.

Report checks that did not run, failed, timed out or lacked an approved tool as `NOT_RUN`, `FAIL`, `INCONCLUSIVE` or `PENDING`, never PASS. Missing final acceptance evidence does not by itself prevent merging an independently useful development slice. Do not require review-convergence rounds or a seven-stage lifecycle ledger merely to write an accurate development status.
