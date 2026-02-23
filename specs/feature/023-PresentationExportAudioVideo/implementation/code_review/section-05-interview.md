# Section-05 Code Review Interview: Slide Render Route

**Date:** 2026-02-23

---

## User Decisions

### H-2: Scope check strategy for `internal:slide-render`

**Question:** `hasScope(claims.scopes, "internal:slide-render")` allows admin/wildcard JWTs to access the internal slide render route. Should we use exact scope matching instead?

**Decision:** Exact match only (`claims.scopes.includes("internal:slide-render")`)

**Rationale:** Only purpose-minted tokens work. Admin and wildcard tokens are rejected. Defense-in-depth for an internal Playwright-only route.

**Fix applied:**
```typescript
// Before
if (!hasScope(claims.scopes, "internal:slide-render")) {

// After
if (!Array.isArray(claims.scopes) || !claims.scopes.includes("internal:slide-render")) {
```
Removed `hasScope` import (unused), kept `verifyBearerToken`.

---

### L-8: Video element readiness in `__slideReady` sentinel

**Question:** The `__slideReady` sentinel only waits for `<img>` elements. Should we also wait for `<video>` elements now?

**Decision:** Defer to video section

**Rationale:** Video playback is implemented in a later section. The readiness logic will be updated when video support is added.

---

## Auto-Fixes Applied

### H-1: XSS via unescaped `</script>` in inlined JSON

**Applied automatically** — clear security fix with no tradeoff.

```typescript
// Before
const slideContentJson = JSON.stringify(slide.slideContent ?? {});

// After
const slideContentJson = JSON.stringify(slide.slideContent ?? {})
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026");
```

### L-7: Unused `and` import

**Applied automatically** — dead import.

```typescript
// Before
import { and, eq } from "drizzle-orm";

// After
import { eq } from "drizzle-orm";
```

### M-3: NaN validation for `parseInt` URL params

**Applied automatically** — returns 400 instead of silently failing with 401.

```typescript
// Added after parseInt:
if (isNaN(urlDeckId) || isNaN(urlSlideIndex)) {
  return res.status(400).json({ error: "Bad request: deckId and slideIndex must be integers" });
}
```

### M-4: Comment on `as any` cast for JWT claims

**Applied automatically** — clarifies intent without changing behavior.

```typescript
// Non-standard claims added at token minting time — not present in the base JWT type
const claimsAny = claims as any;
```

### M-5: Tests for wildcard/admin scope rejection

**Applied automatically** — two new tests confirming exact-match behavior:
- `returns 401 when JWT has wildcard 'internal:*' scope (exact match required)`
- `returns 401 when JWT has 'admin' scope (exact match required)`

### M-6: Tests for non-integer URL params

**Applied automatically** — two new tests:
- `returns 400 when :deckId is non-integer (NaN)`
- `returns 400 when :slideIndex is non-integer (NaN)`

### L-11: CSS assertion strengthened in tests

**Applied automatically** — replaced loose substring checks with exact CSS values:
```typescript
// Before
expect(res.text).toContain("margin");
expect(res.text).toContain("overflow");
expect(res.text).toContain("hidden");

// After
expect(res.text).toContain("margin: 0");
expect(res.text).toContain("overflow: hidden");
```

---

## Items Not Fixed

- **L-8** (video readiness): Deferred per user decision
- **L-9** (CSP header): Low priority, deferred — this route is localhost-only
- **M-5** (wildcard test): Covered by the two new tests above

---

## Final Test Count

**20 tests passing** (up from 16 before review fixes)
