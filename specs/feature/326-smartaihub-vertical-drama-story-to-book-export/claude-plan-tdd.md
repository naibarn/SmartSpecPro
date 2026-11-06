# Feature 326 focused verification plan

| Section | Focused proof |
|---|---|
| 01 domain foundation | Contract parse/limits and stable IDs; repository tenant isolation; source fingerprint changes when selected episode/media changes; stale detection; migration/schema validation |
| 02 authoring/jobs | API authorization and validation; reorder/subset/special episode mapping; edit preservation and immutable approval; duplicate idempotency; credit denial before paid calls; executor registration and restart-safe progress |
| 03 export pipeline | EPUB ZIP structure/order/local resources/escaping/alt text and EPUBCheck; PDF metadata/page/text extraction/Thai Unicode/image ratio; unsafe URL/path rejection; storage checksum/read-back; per-format retry isolation |
| 04 UI/closeout | Component/query tests for loading, empty, validation, partial success, stale source, failed jobs, disabled approval and download; keyboard labels/focus; viewport evidence at 390x844, 768x1024, 1440x900 |

Use existing pnpm/Vitest conventions and only focused commands. Do not run `npm run typecheck` locally. Browser checks should use the repository's authenticated UI verification path if available. Every test that fails due to implementation is fixed before checkpointing; unrelated baseline failures are documented separately.
