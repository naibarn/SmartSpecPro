# Section 03 Code Review Interview

## Review Verdict: APPROVE_WITH_FIXES

## Findings Triage

### Auto-fixed (no user input needed)

1. **HIGH: mcp.ts traceId not sanitized (M27)** — Added sanitization at `mcp.ts:277` matching the pattern in `mcpRoutes.ts`. One-line fix.

2. **HIGH: mcpRoutes.ts::safeJoin missing symlink containment (M20)** — Added `fs.realpathSync` re-check to `safeJoin`, mirroring the fix already in `mcp.ts::resolveWorkspacePath`.

3. **MEDIUM: M21 test uses benign trace ID** — Rewrote to use `"abc../etc/passwd"` and assert injection chars are stripped. Added `MCP_AUDIT_ROTATE_DAILY=0` for predictable file paths.

4. **MEDIUM: M27 test conditional assertion** — Changed from `if (entry)` to `expect(entry).toBeDefined()` — test now fails if audit spy misses the write.

### Let go (not blocking)

5. **LOW: No startup warning for operator-supplied dangerous extensions** — Valid concern but out of scope for this security fix section. Can be addressed in section-15 (cross-system protections).

6. **LOW: Cache eviction O(n) at 500 entries** — Acceptable at current scale. Noted.

7. **INFO: mcp.ts vs mcpRoutes.ts dual surface** — Both files are registered but serve different purposes (gateway vs authenticated). Verified in index.ts — both are active by design.

## Changes Applied

- `mcp.ts:277`: Added traceId sanitization (strip non-alphanumeric except `-_`, cap at 128 chars)
- `mcpRoutes.ts:51-65`: Added symlink resolution + re-check to `safeJoin`
- `mcpGatewaySecurityFixes.test.ts`: Strengthened M21/M27 test with injection chars, deterministic audit path
- `mcpSecurityFixes.test.ts`: Made M27 assertion unconditional
- `mcpRoutesOrchestrator.test.ts`: Updated auth mock to provide tenantId/sub from auth object (not headers)
- `mcpRoutes.test.ts`: Updated to expect 404 on `/mcp/tools` (M26 removal)
