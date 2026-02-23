I now have all the context needed to write the section. Here is the complete content for `section-05-slide-render-route.md`:

# Section 05: Node.js Backend — Internal Slide Render Route

## Overview

This section creates a new Express route (`GET /internal/slide-render/:deckId/:slideIndex`) that serves as the Playwright navigation target for server-side screenshot rendering. It is a security-sensitive endpoint because it provides unauthenticated (from Playwright's perspective) access to slide content — all security is enforced by the application layer (localhost-only + JWT header) and the Nginx layer (deny block).

This section is in **Batch 3** and can be implemented in parallel with `section-03-export-service` and `section-14-infrastructure`. It must be complete before `section-07-python-celery-task` begins, because the Celery task navigates Playwright to this route.

**Dependencies:**
- `section-01-database-migration` — requires `presentation_slides.slideContent` column (already exists; audio columns added in section 01)
- `section-02-shared-contracts` — requires updated type definitions

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.ts` | Create (new Express route) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` | Modify (register new route) |
| `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf` | Modify (add `/internal/` deny block) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.test.ts` | Create (new test file) |

---

## Tests First

Write these tests **before** implementing `slideRender.ts`. Test file location:
`/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
// Use supertest + a minimal Express app that mounts the slide render router.
// Mock DB queries and JWT verification.

describe("GET /internal/slide-render/:deckId/:slideIndex", () => {
  // Access control — IP address checks
  it("returns 403 for non-localhost remote address (simulate ::2)");
  it("accepts req.socket.remoteAddress === '127.0.0.1' (IPv4 loopback)");
  it("accepts req.socket.remoteAddress === '::1' (IPv6 loopback)");
  it("accepts req.socket.remoteAddress === '::ffff:127.0.0.1' (IPv4-mapped IPv6)");

  // JWT header checks
  it("returns 401 when X-Internal-Token header is missing");
  it("returns 401 when X-Internal-Token contains an expired JWT");
  it("returns 401 when JWT deckId claim does not match URL :deckId param");
  it("returns 401 when JWT slideIndex claim does not match URL :slideIndex param");
  it("returns 401 when JWT scope does not include 'internal:slide-render'");

  // Success cases
  it("returns 200 with HTML when JWT is valid and remote address is loopback");
  it("HTML response body contains window.__slideReady = false initialization");
  it("HTML response body contains inlined slideContent JSON (full element data, not just slideshow metadata)");
  it("HTML response sets document.body margin to 0 and overflow to hidden");
  it("HTML response contains script tag with id='slide-data' and correct JSON");

  // Error cases
  it("returns 404 when slideIndex is out of bounds for the deck");
  it("returns 404 when deckId does not exist");
});
```

Key testing notes:
- Mock `req.socket.remoteAddress` to simulate different origins
- Use `vi.mock("../db", ...)` to inject a fake DB that returns controlled slide data
- Use a real `signBearerToken()` call to create valid test JWTs (it uses the same `JWT_SECRET`)
- For the "inlined slideContent" assertion: verify the HTML contains the full `elements` array from `slideContent`, not just `slideId` / `orderIndex`

Run tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test server/routes/slideRender.test.ts`

---

## Implementation

### 1. Create `/home/dev/projects/SmartSpecPro/apps/web/server/routes/slideRender.ts`

This is a plain Express router (not tRPC). Use the existing `webhooks.ts` at `/home/dev/projects/SmartSpecPro/apps/web/server/routes/webhooks.ts` as a structural reference — it shows the established pattern for `createXxxRouter()` factory functions.

**Key imports and dependencies:**
- `Router` from `"express"`
- `verifyBearerToken` from `"../_core/tokens"` — already has JWT verification using `JWT_SECRET`
- DB access: `getDb` from `"../db"` and `presentationSlides`, `presentationDecks` from `"../../drizzle/schema"`
- Drizzle `eq`, `and` for query building

**Loopback address check (middleware):**

The route must enforce localhost-only access. Check `req.socket.remoteAddress` (not the deprecated `req.connection`). The three variants to allow:

```
"127.0.0.1"        — IPv4 loopback (direct local connection)
"::1"              — IPv6 loopback
"::ffff:127.0.0.1" — IPv4-mapped IPv6 (common in dual-stack environments)
```

Any other value returns `403 Forbidden`. This is a secondary defense — the primary defense is the Nginx deny block.

**JWT header check:**

- Read the `X-Internal-Token` request header (not a query parameter — query params appear in server logs)
- Call `verifyBearerToken(token)` from `tokens.ts`
- After verification, assert the decoded claims have:
  - `scopes` array containing `"internal:slide-render"`
  - `deckId` claim (number) matching `parseInt(req.params.deckId, 10)`
  - `slideIndex` claim (number) matching `parseInt(req.params.slideIndex, 10)`
- Return `401` on any mismatch

**DB query — critical requirement:**

The route needs the **full `slideContent` JSONB field** from `presentation_slides`. The slideshow payload used by the editor only contains `slideId`, `orderIndex`, `title`, `durationMs`, and `transition` — it deliberately omits `elements` for performance. This route needs the full content.

Query pattern (reference `presentationService.ts` for Drizzle query style):
```typescript
const db = await getDb();
const slides = await db
  .select()
  .from(presentationSlides)
  .where(eq(presentationSlides.deckId, deckId))
  .orderBy(presentationSlides.orderIndex);
```

Then index into `slides[slideIndex]`. If `slides.length === 0` or `slideIndex >= slides.length` or `slideIndex < 0`, return `404`.

**HTML response:**

The response is `Content-Type: text/html`. It is a minimal self-contained HTML page — no React SPA routing, no editor chrome, no navigation. It renders only the single slide at the configured dimensions (default 1920×1080).

Required elements in the HTML:
1. `<script id="slide-data" type="application/json">` — contains the `slideContent` JSON (use `JSON.stringify(slide.slideContent)`)
2. A canvas div sized to exact deck dimensions
3. A minimal inline script that:
   - Sets `window.__slideReady = false` immediately on parse
   - After `document.fonts.ready` resolves AND all `<img>` elements have `complete === true` (poll with `setInterval`), sets `window.__slideReady = true`
   - For `<video>` elements: sets `video.currentTime = 0` and relies on `poster` attribute
4. `document.body.style.margin = '0'; document.body.style.overflow = 'hidden'`

The inline JavaScript for the ready-check sentinel pattern:
```javascript
window.__slideReady = false;
document.fonts.ready.then(function() {
  var imgs = document.querySelectorAll('img');
  var checkInterval = setInterval(function() {
    var allLoaded = Array.from(imgs).every(function(img) { return img.complete; });
    if (allLoaded) {
      clearInterval(checkInterval);
      window.__slideReady = true;
    }
  }, 50);
  // Safety: set ready after 8s even if images haven't loaded (avoids Playwright timeout)
  setTimeout(function() {
    clearInterval(checkInterval);
    window.__slideReady = true;
  }, 8000);
});
```

Note the 8-second internal safety timeout — this is distinct from Playwright's 10-second external timeout. If images are still loading after 8 seconds, the slide renders without them rather than timing out completely.

**Export function signature:**

```typescript
import { Router } from "express";

export function createSlideRenderRouter(): Router {
  /**
   * Internal route for Playwright-based slide screenshots.
   * Only accessible from localhost; validates X-Internal-Token JWT.
   * Returns minimal HTML with inlined slide data and __slideReady sentinel.
   */
}
```

---

### 2. Register the Route in `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts`

Add the import and registration. Follow the same pattern as `createWebhookRouter()` which is already registered in this file.

Import:
```typescript
import { createSlideRenderRouter } from "../routes/slideRender";
```

Registration — mount **before** the tRPC and `location /` catch-all handlers, and **without** CSRF middleware (the route is not browser-facing):

```typescript
app.use("/internal", createSlideRenderRouter());
```

The route path inside the router will be `GET /slide-render/:deckId/:slideIndex`, so the full path becomes `GET /internal/slide-render/:deckId/:slideIndex`.

**Important:** Do not add this path to the `csrfCheck` middleware that wraps `/trpc` and `/api`. The `/internal` path is localhost-only and uses JWT, not browser cookies.

---

### 3. Modify `/home/dev/projects/SmartSpecPro/nginx/conf.d/dev-host.conf`

Add the following `location` block to **both** server blocks that proxy to the web app:

1. The HTTP `:80` server block (`server_name smartaihub.app localhost`)
2. The HTTPS `:443` server block (`server_name smartaihub.app`)

Place the block **before** the `location /` catch-all block in each server, immediately before the `# Main web app` comment:

```nginx
location /internal/ {
    deny all;
    return 403;
}
```

The current `dev-host.conf` has these server blocks at approximately:
- Line 17: HTTP `:80` block for `smartaihub.app localhost`
- Line 192: HTTPS `:443` block for `smartaihub.app`

The deny block must appear in **both** because requests could arrive on either port during development. The catch-all `location /` at the bottom of each server block would otherwise proxy `/internal/` traffic through to Node.js — the deny block intercepts it first.

After modifying Nginx config:
1. Validate: `./scripts/validate-all-configs.sh`
2. Reload Nginx: `docker exec smartspec-nginx-dev nginx -s reload`

---

## Security Model

This route has two layered defenses:

**Layer 1 (Primary): Nginx deny block**
- Nginx receives all public traffic first
- `location /internal/ { deny all; return 403; }` blocks any external access before it reaches Node.js
- An attacker cannot reach the route from outside the server

**Layer 2 (Secondary): Application-layer localhost check**
- Even if something bypasses Nginx (misconfiguration, direct port access during development), Node.js checks `req.socket.remoteAddress`
- All three loopback variants are checked: `127.0.0.1`, `::1`, `::ffff:127.0.0.1`
- Note: `req.connection` is deprecated since Node.js 13.0.0; always use `req.socket.remoteAddress`

**Layer 3 (Content): JWT header validation**
- `X-Internal-Token` header (not `?token=` query param — to avoid log leakage in Nginx and Node.js access logs)
- Short-lived: 5-minute TTL, just enough for a single Playwright screenshot call
- Token encodes `deckId` and `slideIndex` so a token for slide 3 of deck 42 cannot be used for slide 0 of deck 1
- Scope `internal:slide-render` is checked via `hasScope()` from `tokens.ts`
- The Python Celery task generates these tokens using `PyJWT` with the same `JWT_SECRET`

---

## Context: Why This Route Exists

The Python Celery render task (`section-07-python-celery-task`) uses Playwright (headless Chromium) to take screenshots of slides. Playwright needs a URL to navigate to. The slides are React components with complex layout logic — it is not feasible to re-render them in Python.

The solution is: Node.js provides a special route that renders a single slide as a self-contained HTML page. Playwright navigates to this page, waits for `window.__slideReady === true`, then screenshots it at 1920×1080.

The `window.__slideReady` sentinel is critical — it tells Playwright when fonts have finished loading, all images are decoded, and the slide is visually stable. Without this, screenshots would capture blank images (font swap flash) or broken layouts.

---

## Relation to Other Sections

- **section-02-shared-contracts**: The `slideContent` structure comes from the existing `PresentationSlide` type in the schema. No new types from section 02 are needed for the render route itself, but the deck dimension fields (`width`, `height`) will be available once section 01 is migrated.
- **section-03-export-service**: Section 03 calls Python with a render spec. Python then calls this route. The two sections are independent — this route doesn't call the export service.
- **section-07-python-celery-task**: The Python task generates the JWT for this route using `PyJWT` with the same `JWT_SECRET`. The token payload shape must match what this route validates.
- **section-14-infrastructure**: The `INTERNAL_RENDER_BASE_URL` environment variable controls what base URL the Python task uses to reach this route. Inside Docker, `localhost` refers to the container, not the host; the worker uses `http://host.docker.internal:3000`. Section 14 configures this env var.

---

## Implementation Checklist

## Implementation Results (Actual)

**Status:** COMPLETE — committed 2026-02-23

### Files Created/Modified

| File | Action | Notes |
|------|--------|-------|
| `apps/web/server/routes/slideRender.ts` | Created | Three-layer security: Nginx deny → loopback → JWT |
| `apps/web/server/routes/slideRender.test.ts` | Created | 20 tests passing |
| `apps/web/server/_core/index.ts` | Modified | Added `app.use("/internal", createSlideRenderRouter())` |
| `nginx/conf.d/dev-host.conf` | Modified | Added deny blocks to both HTTP:80 and HTTPS:443 server blocks |

### Deviations from Plan

1. **Scope check changed to exact match** — plan said `hasScope(claims.scopes, "internal:slide-render")`. After code review, changed to `claims.scopes.includes("internal:slide-render")` so admin/wildcard tokens cannot bypass the gate.
2. **NaN validation added** — `parseInt` result is now checked with `isNaN()` before comparing to JWT claims. Returns 400 instead of silently 401.
3. **XSS escaping added** — `JSON.stringify` output is sanitized with `.replace(/</g, "\\u003c")` etc. to prevent `</script>` injection in the HTML template.
4. **`hasScope` import removed** — replaced with direct `Array.isArray` + `.includes` check. `hasScope` is not imported.
5. **`and` import removed** — plan mentioned `eq, and` imports but `and` was not needed.
6. **Video element handling deferred** — plan suggested handling `<video>` readiness; deferred to video section per user decision.

### Final Test Count: 20 tests (up from 16 planned)

Extra tests added during code review:
- `returns 401 when JWT has wildcard 'internal:*' scope`
- `returns 401 when JWT has 'admin' scope`
- `returns 400 when :deckId is non-integer (NaN)`
- `returns 400 when :slideIndex is non-integer (NaN)`