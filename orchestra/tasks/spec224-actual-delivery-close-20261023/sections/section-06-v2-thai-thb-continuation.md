# Section 06 — V2 Thai and THB Continuation

- **Requirement IDs:** V2-Thai, V2-Data-Preservation, V2-Versioning
- **Objective:** Continue the same App ID from the immutable V1 source with Thai UI and THB formatting; do not overwrite V1 or its data.
- **Owned paths:** Existing dedicated App repository and existing Mini-App source/artifact/version services.
- **Prerequisites:** Section 05 verified; owner-confirmed data migration; V1 remains last-known-good until V2 is bound through a linked DevelopmentRun and passes acceptance.
- **Deliverables:** V2 source revision, independently built artifact, linked DevelopmentRun, immutable version history and verified rollback behavior.
- **Verification:** Playwright Chromium against V1 and V2; preserve record keys, IDs, numeric amounts, categories, dates and V1 JSON import/export contract; confirm V1 remains accessible while V2 is a candidate.
- **Completion predicate:** A real authenticated owner continuation binds the V2 source/artifact to the same App ID and new DevelopmentRun; V2 passes the app-level checks before changing LKG.
- **Evidence:** Source/artifact digests, V1/V2 Git revisions, DevelopmentRun ID, version-ledger rows, browser results and rollback proof.
- **Fallback:** Preserve a verified V2 Git branch and built candidate without creating owner-scoped run/version records when no real authenticated owner session is available. Resume through the existing App Home continuation control; never forge auth or write owner state directly.

## Candidate outcome and remaining continuation

- V2 was hand-edited from the retained V1 source; no LLM regenerated V1. Data keys and record fields remain `expenseTracker.records.v1` / `expenseTracker.meta.v1`, with the V1 JSON import/export schema unchanged.
- Private GitHub candidate branch `v2/thai-thb` is based on V1 project revision `7b90395508e8a7084026d7dafc80a8e4b2360493`; V2 source revision is `1d7273d719ff9b034cd304920c1ef76efdd86e76`.
- V2 standalone source/artifact digest: `bdf63148f9a239d0d4b36bb816e92c0ddc299171edd5e74f4cd71c419a50487c`; archive SHA-256: `183da13bd8febb5772eb9d99ed6c7e272924c5eea231de39b1e5e03092843f06`.
- V1 and V2 each passed six focused Playwright Chromium checks; combined evidence is in `/tmp/smartaihub-miniapp-playwright-evidence`.
- Runtime DB still has only V1 deployment version 1. No V2 DevelopmentRun or version row was created because no real authenticated owner browser session is available; V1 remains last-known-good. Resume by opening the existing App Home as its owner and submitting the Thai/THB continuation through Continue Development, then bind this candidate through the normal owner-authenticated path and verify the stored owner records before promotion.
- The real owner action is to open [the existing App Home](https://smartaihub.app/miniapp/app_e6f0be051fd22e09bc4c5dff/status), choose **Continue Development**, and submit: “Add Thai-language UI and THB currency support, preserving existing income, expense, categories, dates, storage records and export/import behavior.” This must create the linked run for the same App ID; do not create a replacement app or write owner-scoped state directly.
