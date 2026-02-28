# Code Review Interview: section-01-db-migration

## Auto-fixes (no user input needed)

### Fix 1: onConflictDoUpdate targetWhere (AUTO-FIX)
**File:** `apps/web/server/services/presentationPersistence.ts`
Add `targetWhere: sql`${presentationConversionRecords.sourceItemId} IS NOT NULL`` to the `onConflictDoUpdate` call so Drizzle generates the correct partial-index-aware `ON CONFLICT` clause.

### Fix 3: mapStoredConversionRecord google_slides handling (AUTO-FIX)
**File:** `apps/web/server/services/presentationPersistence.ts`
Change the ternary to properly return "google_slides" for that format, widen StoredPresentationConversionRecord.sourceFormat.

## User decisions

### Issue 2: sourceItemId in presentationConversionResultSchema
**Decision:** Make optional (`.optional()`)
`sourceItemId` becomes `z.number().int().positive().optional()` in `presentationConversionResultSchema`.

### Issue 4: UpsertPresentationConversionRecordInput widening
**Decision:** Widen now in section-01
- `sourceItemId: number | null`
- `sourceFormat: "pptx" | "ppt" | "google_slides"`
Also update the dependency injection interfaces in `presentationCompatibilityService.ts`.
