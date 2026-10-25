# Section 06 — V2 Thai and THB Continuation

- **Requirement IDs:** V2-Thai, V2-Data-Preservation, V2-Versioning
- **Objective:** Adopt the already prepared Thai/THB Git candidate into the same App ID without LLM generation; preserve V1 and its data.
- **Owned paths:** Existing App Home, DevelopmentRun, worker_jobs/outbox, app-scoped source/artifact storage, version ledger and private App repository.
- **Prerequisites:** Section 05 verified; authenticated App owner; GitHub OAuth connection belongs to that owner; V1 remains last-known-good until package, deploy and smoke pass.
- **Deliverables:** Owner-authenticated “Use prepared V2 candidate” action, linked DevelopmentRun pinned to candidate SHA, verified app-scoped source bundle, V2 artifact, immutable version row and rollback path.
- **Verification:** Validate exact branch head, V1 parent, source/build manifest and all file SHA-256 values; skip Gateway generation; run package/deploy/smoke only; preserve the V1 data keys, IDs, numeric amounts, categories, dates and import/export contract.
- **Completion predicate:** The authenticated owner adopts the pinned candidate through the existing App Home; the same App ID and exact Git SHA are linked to a run; V2 smoke passes before LKG changes.
- **Evidence:** Source/artifact digests, V1/V2 Git revisions, DevelopmentRun ID, version-ledger rows, browser results and rollback proof.
- **Fallback:** Before owner adoption, keep the candidate branch, V1 runtime and data intact; do not create owner-scoped run/version records. The owner uses the one candidate-adoption button in the existing App Home; do not route this prepared change through prompt-based Continue Development.

## Candidate outcome and remaining continuation

- V2 was hand-edited from the retained V1 source; no LLM regenerated V1. Data keys and record fields remain `expenseTracker.records.v1` / `expenseTracker.meta.v1`, with the V1 JSON import/export schema unchanged.
- Private GitHub candidate branch `v2/thai-thb` is based on V1 project revision `7b90395508e8a7084026d7dafc80a8e4b2360493`; V2 source revision is `1d7273d719ff9b034cd304920c1ef76efdd86e76`.
- V2 standalone source/artifact digest: `bdf63148f9a239d0d4b36bb816e92c0ddc299171edd5e74f4cd71c419a50487c`; archive SHA-256: `183da13bd8febb5772eb9d99ed6c7e272924c5eea231de39b1e5e03092843f06`.
- V1 and V2 each passed six focused Playwright Chromium checks; combined evidence is in `/tmp/smartaihub-miniapp-playwright-evidence`.
- Runtime DB still has only V1 deployment version 1. No V2 DevelopmentRun or version row was created because no real authenticated owner browser session is available; V1 remains last-known-good. Resume by opening the existing App Home as its owner and submitting the Thai/THB continuation through Continue Development, then bind this candidate through the normal owner-authenticated path and verify the stored owner records before promotion.
- The real owner action is to open [the existing App Home](https://smartaihub.app/miniapp/app_e6f0be051fd22e09bc4c5dff/status) and choose **Use prepared V2 candidate**. The server then verifies the owner's existing GitHub connection and pinned candidate revision before creating a no-generation run for this same App ID.
