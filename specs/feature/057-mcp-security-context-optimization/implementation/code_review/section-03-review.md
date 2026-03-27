## Review Report

### Verdict: APPROVE_WITH_FIXES

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| HIGH | `mcp.ts:277` | M27 log injection fix applied to `mcpRoutes.ts` but **not** to `mcp.ts`. `traceId` is read directly from `x-trace-id` without sanitization and is written verbatim into both the JSONL audit log (lines 293, 300) and the HTTP response body (lines 294, 301). An attacker can inject newlines to forge audit records. | Extract the same `sanitizeTraceId` helper into a shared utility (or duplicate it) and apply it at `mcp.ts:277` before using the value. |
| HIGH | `mcpRoutes.ts:51-58` | M20 symlink containment fix applied to `mcp.ts::resolveWorkspacePath` but **not** to `mcpRoutes.ts::safeJoin`. `safeJoin` checks the lexical path only — a symlink inside the workspace pointing outside it will pass the containment check and the real file will be read. The `mcpRoutes.ts` workspace read/write tools (`workspace_read_file`, `workspace_write_file`) are therefore still vulnerable. | Add `fs.realpathSync` re-check to `safeJoin`, matching the pattern in `resolveWorkspacePath`. Only call `realpathSync` when the path exists (guard with `fs.existsSync`). |
| MEDIUM | `mcpGatewaySecurityFixes.test.ts:163-184` | The M21 test ("traceId with traversal chars is sanitized in audit") uses the benign trace value `"abc-123"` which has no injection characters. The test verifies that the string appears in the audit file, but this passes even when there is no sanitization at all. Because `mcp.ts` does not sanitize the trace ID (see HIGH finding above), the test is vacuously green — it would also pass with the vulnerable code. | Send a trace ID containing `\n`, `\r`, or `/` characters (e.g. `"abc\netc/passwd"`) and assert that the stored audit entry does not contain those characters. Additionally add a `reject` check on the file contents rather than a truthy `if (existsSync)` guard. |
| MEDIUM | `mcpSecurityFixes.test.ts:499-504` | The M27 `appendFileSync` spy filter matches on `filePath.includes("mcp_audit")`. The `writeAudit` function in `mcpRoutes.ts` writes to `logs/mcp_audit.log` (resolved relative to `process.cwd()`). Whether the spy intercepts the write depends on where the test process runs. If `process.cwd()` does not produce a path containing the literal string `"mcp_audit"`, the `auditEntries` array stays empty and the final `if (entry)` guard silently skips the assertion — the test passes vacuously. | Use a deterministic path via `tmp` (already available), or set `MCP_AUDIT_LOG_PATH` env var and match on that path in the spy filter. Follow up with an unconditional assertion rather than a conditional `if (entry)`. |
| LOW | `mcpRoutes.ts:24` | `EXT_ALLOW` default list does not include `.env` (correctly), but an operator could re-introduce it via `MCP_EXT_ALLOWLIST`. There is no runtime check or startup warning that validates operator-supplied lists against a hardcoded denylist of dangerous extensions (`.env`, `.key`, `.pem`, `.p12`). A misconfiguration restores the vulnerability silently. | Add a startup assertion that logs a `WARN` (or throws) if any of `[".env", ".key", ".pem", ".p12", ".pfx"]` appear in the operator-supplied `MCP_EXT_ALLOWLIST` or `MCP_READ_EXT_ALLOWLIST`/`MCP_WRITE_EXT_ALLOWLIST`. |
| LOW | `mcpRoutes.ts:693` | Cache eviction only runs when `_pythonToolsCacheMap.size > 500`. If eviction removes all stale entries and then new entries are added in the same burst, the map can oscillate around 500 entries without ever clearing down. This is cosmetic but the scan-all-keys eviction strategy is O(n) — acceptable at 500 but worth noting as a DoS risk under high user load if TTL is short. | Consider a time-based eviction (e.g. `setInterval`) or LRU structure, but this is non-blocking. |
| INFO | `mcp.ts` (whole file) | `mcp.ts` uses a separate route prefix (`/api/mcp/invoke`) and a gateway key model, while `mcpRoutes.ts` uses JWT auth at `/api/mcp/call`. It is unclear whether both files are mounted simultaneously in production. If so, the gateway file provides a second unauthenticated surface for the same workspace tools. Verify in `server/_core/index.ts` that only one of the two registration functions is active per deployment. | Confirm in `index.ts` registration logic which file is the canonical route and document whether `mcp.ts` is a legacy internal path or still active. |

### Contract Compliance

| Check | Status |
|---|---|
| M16 — `requireGatewayKey` returns 503 when key is unset | PASS — line 90-92 in `mcp.ts` correctly returns 503 |
| M17/M18 — `.env` removed from `DEFAULT_READ_EXTS` and `DEFAULT_WRITE_EXTS` | PASS — removed from both default strings in `mcp.ts`; also absent from `mcpRoutes.ts` `EXT_ALLOW` |
| M03 — Extensionless files rejected | PASS — both `checkPathPolicy` (`mcp.ts:143-145`) and `assertExtAllowed` (`mcpRoutes.ts:63`) throw when `!ext` |
| M19 — `sessionId` UUID validation before URL composition | PASS — `UUID_RE` tested before `encodeURIComponent` at `mcp.ts:180-183` |
| M20 — Symlink containment re-check after `realpathSync` | PARTIAL — fixed in `mcp.ts::resolveWorkspacePath` (lines 109-115), **absent** from `mcpRoutes.ts::safeJoin` |
| M01 — `tenantId` resolved from auth only, not `x-tenant-id` header | PASS — header read removed at `mcpRoutes.ts:653-662`; `callTool` pulls only from `auth.tenantId` / `auth.user.tenantId` |
| M04 — Python tools cache keyed per user+tenant | PASS — `_pythonToolsCacheMap` uses composite key `"${userId}:${tenantId}"` with eviction |
| M06 — `userId` resolved from `auth.sub` only, not `x-user-id` header | PASS — `actorUserIdHeader` variable and header read removed; only `auth.sub` used |
| M26 — Duplicate `/mcp/` alias routes removed | PASS — two alias registrations deleted from `registerMCPRoutes`; test confirms 404 |
| M27 — Trace ID sanitized in `mcpRoutes.ts` audit paths | PASS — `sanitizeTraceId` applied at all three audit call sites in `mcpRoutes.ts` |
| M27 — Trace ID sanitized in `mcp.ts` audit paths | FAIL — `mcp.ts:277` reads `x-trace-id` without sanitization; used in audit and response |
| Test coverage for M16 | PASS — two tests (empty, unset), plus M25 dev-mode test |
| Test coverage for M01 | PASS — two tests (header present, header present but auth missing tenantId) |
| Test coverage for M04 | PASS — cross-user-tenant fetch count verified |
| Test coverage for M26 | PASS — both alias paths return 404 |
| Test coverage for M19 | PASS — traversal input `"../../admin"` correctly rejected |
| Test coverage for M20 (mcp.ts) | PASS — symlink pointing at `/tmp` rejected |
| Test coverage for M20 (mcpRoutes.ts) | MISSING — no test exercises `safeJoin` with a symlink |
| Test coverage for M27 (mcpRoutes.ts) | PARTIAL — assertion is conditional and could pass vacuously (see MEDIUM finding) |
| Test coverage for M27 (mcp.ts) | FAIL — M21 test uses a benign trace ID; does not validate that injection chars are stripped |

### Summary

Seven of the ten listed vulnerabilities are cleanly resolved with focused, minimal diffs. Two linked omissions create residual risk: the `mcp.ts` gateway router still writes an unsanitized trace ID into its audit log and HTTP response (M27, HIGH), and `mcpRoutes.ts::safeJoin` does not apply the symlink resolution that was added to `mcp.ts::resolveWorkspacePath` (M20, HIGH). Both gaps are small, one-to-five line fixes. The two corresponding tests are also weak — the M21 gateway test uses a safe trace value that cannot detect the bug, and the M27 `mcpRoutes` test has a conditional assertion that will pass silently if the spy filter misses the write. These four items (two code, two test) should be corrected before merge.
