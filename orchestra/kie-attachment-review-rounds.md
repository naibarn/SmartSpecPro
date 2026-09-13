# Kie attachment boundary review rounds

Scope: image/video reference preparation for active Node -> Python -> Kie.ai
generation paths. No live provider call, credit spend, deployment, or secret
file mutation is part of this review.

## Round 01 — active path and contract ownership

- Checked the registered FastAPI routers and gateway/provider call sites.
- Confirmed the active path is `/api/v1/media` -> unified gateway ->
  `KieAIProvider`; the legacy generation router is not registered by the main
  application.
- Result: no routing fix required. The attachment boundary remains owned by the
  Python Kie provider, with Node responsible for tenant-scoped managed URL
  resolution.

## Round 02 — URL/token safety and managed references

- Audited Node managed-storage URL minting, nested extra-parameter resolution,
  Python protected-path detection, and audit payload sanitization.
- Found that Python diagnostic redaction hid query strings but could retain a
  signed token embedded in `/api/mcp/downloads/<token>/...` or another managed
  path.
- Fixed `_redact_url_for_log` to retain only the safe route marker and redact
  protected path tokens, query strings, and fragments; added a regression test.
- Result: fixed; no protected URL should be emitted by the Python reference
  diagnostics.

## Round 03 — byte signature and format fidelity

- Audited image/video magic-byte detection, upload filename/MIME derivation,
  stale response headers, WebP handling, and invalid-content rejection.
- Confirmed the adapter derives the upload type from bytes rather than the URL
  suffix or source `Content-Type`; it preserves original bytes and supports the
  documented PNG/JPEG/WebP/GIF/BMP/TIFF image set plus MP4/MOV/WebM/AVI video.
- Confirmed invalid/empty/unsupported media is rejected before task creation.
- Result: no implementation gap found after the existing regression coverage;
  focused Kie provider suite passed 49/49 after the Round 02 change.

## Round 04 — data URL and base64 fidelity

- Audited standard base64 and percent-encoded data URLs, invalid encodings, and
  the upload request body.
- Added tests proving the exact original bytes are sent as multipart file data;
  no re-encoding, lossy conversion, or provider JSON base64 fallback is used.
- Invalid data URLs fail before upload and before generation submission.

## Round 05 — video object arrays and trim metadata

- Audited `video_url`, `video_urls`, and object-array forms with `start`/`end`
  metadata.
- Added a forced-upload regression proving only the URL is replaced while
  trim metadata is preserved and one provider file upload occurs.

## Round 06 — dynamic catalog fields

- Audited high-level references versus catalog-driven dynamic fields, including
  Qwen `image_urls` and the no-high-level-reference path.
- Added a regression proving a protected dynamic image field is fetched,
  uploaded, and submitted only as the Kie URL.

## Round 07 — retry and paid-submission boundary

- Audited retry classification for deterministic access, invalid data, MIME,
  and size failures versus transient provider failures.
- Confirmed deterministic attachment failures are non-retryable and occur before
  task creation; upload transport failures remain eligible for bounded recovery.

## Round 08 — upload response contract

- Found that an HTTP-200 upload response with a provider business error code
  could be accepted if it also contained a URL.
- Added business-code and `success=false` checks; added a test proving generation
  submission is not called after that failure.

## Round 09 — Node staging and legacy path audit

- Confirmed staged marketplace Kie references normalize to lossless PNG with
  matching `.png` and `image/png` metadata.
- Audited the old unregistered generation provider and routed its compatibility
  image/video references through the canonical Kie attachment preparer with
  forced upload, preventing a future re-enable from restoring direct-URL drift.

## Round 10 — SSRF boundary

- Found that server-side upload fetches needed a private-target guard.
- Added fail-closed blocking for localhost, private/loopback IP literals, and
  internal host suffixes while preserving system-generated managed media paths;
  added a no-network regression test.

## Round 11 — limits and diagnostic redaction

- Clamped attachment URL/byte limits to positive values so invalid environment
  configuration cannot disable validation.
- Extended diagnostic redaction to URL fragments and added regression coverage.

## Round 12 — final convergence gate

- Final focused Python attachment/retry suite passed 77/77; Qwen/mode/
  transparency routing suite passed 29/29; Node staged/catalog suite passed
  35/35; provider and provider-test Ruff passed; changed Python files compiled.
- The legacy compatibility provider import was verified with `DEBUG=false`; the
  default shell value `DEBUG=release` was an environment/configuration failure,
  not a code failure. Import ordering for the legacy file was fixed without
  broad-formatting its pre-existing diagnostics.
- `git diff --check` passed. Unrelated dirty and untracked user files remain
  present and were not reverted or rewritten.
- Result: convergence reached for the local implementation scope. Live Kie
  connectivity, production file-upload behavior, deployment, and production
  recovery evidence remain explicit external gates.

## Round 13 — post-gate suffix/byte consistency

- Cross-path audit found a Node GPT-image helper that changed `.webp` to `.jpg`
  without converting the bytes.
- Removed the relabeling and added a regression proving the source URL identity
  is preserved; the canonical Python Kie boundary now owns byte validation and
  provider upload metadata.

## Repeat audit — 2026-09-13 (20 rounds)

This is a fresh implementation audit after the earlier 13-round review. The rounds were repeated across the active Kie image/video paths, staged-reference preparation, retry classification, security boundary, tests, and repository gates.

- **R01 — active path inventory:** confirmed the canonical Python Kie boundary and the legacy compatibility path; legacy routing delegates attachment preparation rather than reintroducing a second upload policy.
- **R02 — gateway/catalog mapping:** checked `image_urls`, `imageUrls`, `input_urls`, and `video_urls`; dynamic provider fields remain normalized at the boundary.
- **R03 — URL policy:** confirmed short queryless public URLs may pass directly, while protected, signed/query-bearing, data, non-HTTP, managed, private, or overlong references are uploaded through the canonical boundary.
- **R04 — data/base64 fidelity:** verified data URLs decode to original bytes and are streamed; no JSON base64 fallback is used.
- **R05 — staged conversion failure:** found that staged reference conversion could forward the raw unsupported reference after a conversion error. Fixed by failing closed with `staged_reference_prepare_failed:<kind>:<index>` before provider submission.
- **R06 — video arrays:** inspected scalar and object-array video references and confirmed source deduplication plus bounded metadata handling.
- **R07 — dynamic fields/legacy provider:** confirmed legacy `image_urls` and `video_url` compatibility uses the same upload/validation boundary and closes its helper client.
- **R08 — retry markers:** found hardcoded size text in the non-retry classifier, which failed when configured limits changed. Added stable image/video invalid-content, empty, unsupported-type, and too-large markers and updated classification.
- **R09 — SSRF/private targets:** found that a managed path could bypass the private-target check. Removed that bypass and added redirect-history/final-target private-literal checks.
- **R10 — model/limit/upload response:** verified server-side limits, multipart upload, provider business-error response handling, and usable-URL validation.
- **R11 — transient video download:** found a ternary bug that classified every video download error as permanent access failure. Fixed transient video errors to remain retryable while permanent access failures remain terminal input failures.
- **R12 — focused Python proof:** attachment/model/retry suites passed after the repairs.
- **R13 — second-order diff review:** confirmed changes remain limited to Kie attachment preparation, staged reference preparation, retry classification, and focused tests.
- **R14 — Node guard review:** an initial source guard was too strict because it rejected an allowed safe direct-URL push. Relaxed the guard to reject only raw fallback after conversion failure; the focused suite then passed.
- **R15 — static sweep:** checked remaining raw base64, suffix relabeling, direct provider upload, and staged fallback patterns; no new unsafe active path was found.
- **R16 — helper/error-marker proof:** focused helper tests passed for private managed paths, transient/permanent video errors, and configured-limit markers.
- **R17 — syntax/lint proof:** canonical provider Ruff and Python compilation passed; full legacy-file Ruff remains baseline-noisy and was not broadly cleaned.
- **R18 — exact media service regression:** the existing `mediaGenerationService.test.ts` has 7/52 failures involving baseline endpoint expectations, prompt expectations, and tenant-scoped fixture setup. The current Kie patch does not touch those behaviors; they were not weakened to make the suite green.
- **R19 — repository typecheck:** `npm run check` remains repository-wide baseline-noisy with unrelated TypeScript failures; no changed-path Kie/staged error was used as a reason to weaken the contract.
- **R20 — final integrity gate:** focused Python 81/81 and Node 58/58 passed; canonical provider Ruff, `py_compile`, async compatibility import, and `git diff --check` passed. No unresolved in-scope Kie attachment gap remained.

**Convergence:** 20 fresh rounds completed. The final clean rounds were R16, R17, and R20. Live Kie/provider, deployment, and production recovery evidence remain explicit external gates; no live call, credit spend, `.env` mutation, or deployment was performed.
