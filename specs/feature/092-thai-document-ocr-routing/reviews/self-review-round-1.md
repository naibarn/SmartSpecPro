# Self Review Round 1 - 092 Thai Document OCR Routing with Typhoon OCR 1.5

## Findings

1. `documentOcrSettings.ts` uses a 30-second cache, so routing settings could lag behind admin saves unless the save path explicitly invalidates the cache.

## Fix applied

- Added explicit cache invalidation requirements to the plan and TDD docs.
- Updated the section file for the routing contract to require `clearDocumentOcrSettingsCache()`.
- Updated the observability section to require immediate refresh after `document_ocr` saves.

## Remaining risk

- The admin UI still depends on the existing tenant feature flag hook/query for blocked-state messaging; the implementation must reuse the repo's existing pattern instead of inventing a second policy source.

## Self-review conclusion

The plan is now internally consistent and ready for implementation planning handoff.

