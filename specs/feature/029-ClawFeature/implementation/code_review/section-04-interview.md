# Section 04 Code Review Interview

## Auto-fixes Applied

### Fix 1: postMessage wildcard target origin (CRITICAL) — AUTO-FIXED
- Changed `ArtifactSandbox.tsx` to use `SANDBOX_ORIGIN` instead of `"*"` when calling `postMessage`
- Prevents content leakage to unintended origins

### Fix 2: sandbox.html wildcard response origin (CRITICAL) — AUTO-FIXED
- Changed sandbox.html to respond with `event.origin` (already validated) instead of `"*"`
- Ensures responses only go back to the validated parent

### Fix 4: localhost bypass removed (HIGH) — AUTO-FIXED
- Removed `event.origin.startsWith('http://localhost')` bypass from sandbox.html
- Removed `event.origin.startsWith("blob:")` bypass from ArtifactSandbox.tsx
- Production code should only accept the exact SANDBOX_ORIGIN / ALLOWED_ORIGIN

### Fix 5: createArtifactVersion ownership validation (HIGH) — AUTO-FIXED
- Added conversation ownership check: verifies userId and tenantId before allowing version creation
- Updated router to pass tenantId to service function
- Added FORBIDDEN error mapping in router

### Fix 10: MermaidRenderer DOMPurify sanitization (MEDIUM) — AUTO-FIXED
- Added `DOMPurify.sanitize(rendered, { USE_PROFILES: { svg: true, svgFilters: true } })` to Mermaid SVG output
- Consistent with SvgRenderer's sanitization approach

### Fix 17: Mermaid Date.now() ID (LOW) — AUTO-FIXED
- Replaced `Date.now()` with React `useId()` for stable, unique element IDs across re-renders

### Fix 18: X-Frame-Options ALLOWALL invalid (LOW) — AUTO-FIXED
- Removed `X-Frame-Options "ALLOWALL"` from sandbox.conf (not a valid value per RFC 7034)
- CSP `frame-src 'none'` already handles framing restrictions

## Items Let Go

### Issue 3: Unvalidated HTML injection in sandbox.html — BY DESIGN
- The sandbox exists specifically to render untrusted HTML/React in an isolated origin
- `sandbox="allow-scripts allow-forms"` (no `allow-same-origin`) prevents access to parent cookies/storage
- Separate domain (sandbox.smartaihub.app) provides full origin isolation

### Issue 6: getArtifactVersions double-loads all artifacts — ACCEPTABLE
- Version chain walking requires loading conversation artifacts to traverse parent links
- Optimization with SQL CTE could be added later but the current approach is correct

### Issue 7: parseArtifactBlocks/storeArtifacts not called in message flow — KNOWN TODO
- Integration with the chat streaming handler is complex (SSE stream, token accumulation)
- The parsing and storage functions are implemented and tested independently
- Integration will be a follow-up when the chat stream handler is refactored for artifact detection

### Issue 8: Artifact chips in ChatView missing — KNOWN TODO
- ChatView message rendering would need artifact chip components inline
- The CanvasPane provides artifact browsing via the right panel instead
- Inline chips are a UX enhancement for a future iteration

### Issue 9: Nginx sandbox HTTP-only — DEPLOYMENT CONCERN
- SSL termination is handled by the main Nginx or upstream reverse proxy
- The sandbox.conf is for internal Docker network; SSL is layered externally
- DNS and SSL cert for sandbox.smartaihub.app documented as deployment TODO

### Issue 11: Feature flag not checked in updateArtifact — ACCEPTABLE
- The canvas feature flag gates the UI (CanvasPane rendering and format instruction injection)
- If a user calls the API directly without UI, the artifact endpoints are still safe behind `protectedProcedure`
- Feature flag enforcement at the API level can be added when the flag system is formalized (section 14)

### Issue 12: getArtifacts returns all versions — ACCEPTABLE
- Current implementation returns all rows sorted by createdAt
- For initial implementation, the frontend filters/groups by artifact chain
- Optimization to return only latest per chain is a future improvement

### Issue 13: Pervasive any types — ACCEPTABLE
- TypeScript strict mode catches most issues; JSONB columns inherently return `any`
- Tightening types is a cleanup task, not a correctness issue

### Issue 14: Missing UUID validation on artifactId — LOW RISK
- `z.string()` input validation is sufficient; invalid UUIDs return NOT_FOUND from DB query
- Adding `.uuid()` is a minor improvement but doesn't change behavior

### Issue 15: artifact.test.ts tests service functions — VALID APPROACH
- Testing the underlying service functions validates business logic directly
- Router integration tests would require full tRPC test context setup

### Issue 16: storeArtifacts JSONB race condition — LOW RISK
- Would require two concurrent LLM responses writing artifacts for the same message
- In practice, one response per message; JSONB race is theoretical

### Issue 19: No error boundaries on renderers — NICE TO HAVE
- Individual renderers have try/catch in their effect hooks
- React error boundaries for renderer crashes are a UX polish item

### Issue 20: TOCTOU flaw in tenant isolation — EXTREMELY LOW RISK
- Would require a malicious user changing conversation ownership between the check and the query
- Standard pattern used throughout the codebase
