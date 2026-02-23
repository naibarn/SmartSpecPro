# Section-05 Code Review: Slide Render Route

**Verdict: NEEDS WORK**
**Date:** 2026-02-23

---

## Summary

The implementation covers the three-layer security model (Nginx deny → loopback check → JWT validation) and the `window.__slideReady` sentinel pattern correctly. Two HIGH security issues need to be addressed before commit.

---

## Findings

### HIGH

**H-1: XSS via unescaped `</script>` in inlined JSON**
- File: `apps/web/server/routes/slideRender.ts:395`
- `JSON.stringify(slide.slideContent ?? {})` does not escape `</script>` sequences.
- If slide content contains `{"evil": "</script><script>alert(1)</script>"}`, the browser would interpret it as closing the data script tag and injecting a new script.
- Fix: sanitize with `.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')`
- Risk: An attacker with write access to slide content could inject scripts into the render page, potentially executing in the Playwright context.

**H-2: `hasScope` wildcard bypass allows admin tokens to access internal route**
- File: `apps/web/server/routes/slideRender.ts:366`
- `hasScope(claims.scopes, "internal:slide-render")` returns `true` for any token with `"admin"`, `"*"`, or `"internal:*"` scope.
- This means a stolen or reused admin JWT could access slide render data without a purpose-specific token.
- The route is localhost-only (Layer 2), so exploitability requires local access, but defense-in-depth favors exact matching.
- Fix option A: `claims.scopes.includes("internal:slide-render")` — exact match only (most secure)
- Fix option B: Also allow `"internal:*"` wildcard but NOT `"admin"` (balanced)
- **Requires user decision:** Is it intentional that admin tokens bypass this gate?

---

### MEDIUM

**M-3: No NaN validation on `parseInt` URL params**
- File: `apps/web/server/routes/slideRender.ts:371-372`
- `parseInt("abc", 10)` returns `NaN`. The claims comparison `claimsAny.deckId !== NaN` is always `true` (NaN !== NaN), so a non-integer URL would return 401 instead of 400.
- This is a minor semantic issue — the request is correctly rejected, just with the wrong status code.
- Fix: add `if (isNaN(urlDeckId) || isNaN(urlSlideIndex)) return res.status(400).json({ error: "Bad request: non-integer params" });`

**M-4: `as any` cast for deckId/slideIndex claims lacks explanation**
- File: `apps/web/server/routes/slideRender.ts:373`
- `const claimsAny = claims as any;` accesses non-standard JWT claims. Needs a comment explaining why.
- Fix: Add comment: `// Non-standard claims added at token minting time — not present in the base JWT type`

**M-5: No test for wildcard scope bypass (depends on H-2 decision)**
- If H-2 keeps `hasScope`, add test: `makeValidToken({ scopes: ["internal:*"] })` → should return 200.
- If H-2 uses exact match, add test: `makeValidToken({ scopes: ["internal:*"] })` → should return 401.

**M-6: No test for non-integer URL params**
- No test verifying behavior when `:deckId` or `:slideIndex` are non-integer strings.
- Fix: Add test that sends `GET /internal/slide-render/abc/def` → expect 400 or 401 (consistent with chosen behavior).

---

### LOW

**L-7: Unused `and` import**
- File: `apps/web/server/routes/slideRender.ts:330`
- `import { and, eq } from "drizzle-orm"` — `and` is imported but never used in the implementation.
- Fix: Remove `and` from the import.

**L-8: `__slideReady` waits only for `<img>` elements, not `<video>`**
- File: `apps/web/server/routes/slideRender.ts:414-426`
- The readiness polling checks `img.complete` but ignores `<video>` elements.
- If slides contain video thumbnails or video elements, Playwright may screenshot before they render.
- Fix: Also check `video.readyState >= 2` (HAVE_CURRENT_DATA). May be deferred to a later section if video support is not yet implemented.
- **Requires user decision:** Implement now or defer to video section?

**L-9: No `X-Content-Type-Options` or CSP header on the render page**
- The HTML response has no `Content-Security-Policy` header.
- Since this is localhost-only and Playwright-only, the risk is low, but defense-in-depth would add `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'`.
- Low priority — can be deferred.

**L-10: `req.connection` vs `req.socket` (already correct)**
- Implementation correctly uses `req.socket?.remoteAddress` (not deprecated `req.connection`). No fix needed.

**L-11: CSS assertions in test could be more specific**
- File: `apps/web/server/routes/slideRender.test.ts:235-238`
- Test asserts `res.text.toContain("margin")` and `toContain("hidden")` — these would pass even if margin/overflow were set elsewhere in the HTML.
- Fix: Assert the specific CSS rule `margin: 0` and `overflow: hidden` or check within the `<style>` tag.

---

## Items Requiring User Decision

1. **H-2**: Should `hasScope` wildcard/admin bypass be allowed for `internal:slide-render`, or should this route use exact scope matching?
2. **L-8**: Implement video element readiness check now, or defer to the video section?
