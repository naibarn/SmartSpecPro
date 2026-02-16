# Section 04 Code Review Interview

## Decisions

### Issue #3: Missing dedicated stage procedures
**Decision:** Keep generic summary/timeSeries but add `stage` filter parameter (acquisition|activation|usage|revenue) that maps to known eventName groups via STAGE_PRESETS.
**Applied:** Yes - stage param added to summary, timeSeries, and export inputs

## Auto-fixes Applied

### Issue #1: CSV injection
Added `escapeCsvField()` that quotes fields containing commas, newlines, or formula injection characters (=, +, -, @).

### Issue #2: redis.keys() blocking
Added `scanAndDelete()` using SCAN stream with fallback to keys() for clients without scanStream.

### Issue #4: Silent fallback to "default" tenant
Now throws TRPCError("BAD_REQUEST") when both ctxTenantId and registeredDomain are null.

### Issue #5: Role defaulting to "admin"
Changed to default to "domain_admin" (more restrictive) when role is null/undefined.

### Issue #7: No structured logging
Added `resolveScope()` helper that logs scope resolution with console.log.

### Issue #8: timeSeries not cached
Added cachedQuery wrapper to timeSeries procedure with proper cache key.

### Issue #13: Unused test imports
Cleaned up to only import what's used.

## Let Go
- Issue #6: Properties exposure in rawEvents - security is section-07's scope
- Issue #9: Cache key bucket - not relevant for summary
- Issue #10-12: Minor test/pattern improvements
