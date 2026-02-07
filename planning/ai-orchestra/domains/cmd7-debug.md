# CMD-7: Debug Detective — Domain Knowledge

## Ownership
Root cause analysis across ALL domains. No code ownership — follows errors wherever they lead.

## MANDATORY Protocol

### Phase 1: UNDERSTAND (No code edits)

1. **Reproduce** — Run the exact command/test that fails. Copy full error output.
2. **Read the error** — Parse error message, stack trace, file:line references.
3. **Trace the data flow** — Read source from entry point → error location. Full call chain.
4. **Identify root cause** — State in one sentence: "The bug is caused by X because Y."
5. **Search for similar** — Grep codebase for similar patterns with the same bug.

### Phase 2: PLAN (Still no code edits)

6. **Minimal fix** — Smallest change that fixes root cause.
7. **Predict side effects** — What code depends on what you'll change?
8. **Write test first** — If no test covers this case, write one that fails.

### Phase 3: FIX (Now may edit)

9. **ONE focused change** — No refactoring, no cleanup, fix ONLY the bug.
10. **Run failing test** — Verify it passes.
11. **Run full suite** — `pnpm test` (web) or `pytest` (python).
12. **If still fails** — STOP. Go back to Phase 1 step 2. Read the NEW error.

### Hard Rules
- **3-attempt limit**: Same error persists after 3 attempts → STOP, ask user
- **No shotgun debugging**: One change, one test, one verification
- **No silent assumptions**: If unsure what something does, READ it
- **Revert failed fixes**: If change makes it worse, revert before trying again
- **Read before write**: Always read current file state before editing

## Error Domain Mapping

### Frontend Errors (CMD-1 territory)
| Error Pattern | Likely Cause | Start Looking |
|---|---|---|
| `Cannot read property of undefined` | Missing null check, wrong data shape | Component where error occurs → check props/state |
| `Element renders blank/invisible` | CSS issue (display, height, overflow, !important) | `index.css` global rules → component inline styles |
| `Hydration mismatch` | Server/client render difference | Check for `typeof window` guards |
| `TRPCClientError` | Backend returned error | tRPC router → service layer → Zod schema |
| `Module not found` | Path alias or missing import | `vite.config.ts` aliases, `package.json` deps |

### Backend Errors (CMD-2 territory)
| Error Pattern | Likely Cause | Start Looking |
|---|---|---|
| `TRPCError: UNAUTHORIZED` | JWT expired/missing, session invalid | Auth middleware → `sdk.verifySession()` |
| `TRPCError: BAD_REQUEST` | Zod validation failed | Router input schema → client request shape |
| `TRPCError: INTERNAL_SERVER_ERROR` | Unhandled exception in service | Service layer → external API calls |
| `ECONNREFUSED` | Service not running | Docker container status, port conflicts |
| `Pool exhausted` | DB connection leak | Missing connection release, transaction not closed |

### Python Errors (CMD-3 territory)
| Error Pattern | Likely Cause | Start Looking |
|---|---|---|
| `RuntimeWarning: coroutine never awaited` | Missing `await` | Async function call sites |
| `sqlalchemy.exc.OperationalError` | DB connection issue | Connection pool config, missing `async with` |
| `celery.exceptions.Retry` | Task retry triggered | Task function, retry conditions |
| `pydantic.ValidationError` | Schema mismatch | Request/response model vs actual data |
| `httpx.ConnectError` | External API unreachable | Provider config, network, API status |

### Database Errors (CMD-4 territory)
| Error Pattern | Likely Cause | Start Looking |
|---|---|---|
| `relation "X" does not exist` | Migration not run | `drizzle/meta/_journal.json`, run `pnpm db:push` |
| `column "X" does not exist` | Schema drift | `drizzle/schema.ts` vs actual DB |
| `violates foreign key constraint` | FK reference missing | Parent record doesn't exist |
| `duplicate key value violates unique` | Unique constraint conflict | Insert data has duplicate |

### CSS Debugging (Special Protocol)
1. **Check `index.css` first** — global hide rules (`display: none !important`)
2. **Check specificity** — `!important` overrides everything
3. **Check attribute selectors** — `[aria-label*="..."]`, `[data-testid*="..."]` match broadly
4. **Use getBoundingClientRect()** in console — dimensions 0x0 = hidden/collapsed
5. **Check parent chain** — parent `overflow: hidden` with 0 height clips children
6. **Flex layout traps:**
   - `height: 100%` doesn't work in flex context → use `flex: 1`
   - Need `min-height: 0` for flex children to shrink below content
   - Need `height: 0` + `flex: 1` for reliable flex growth

### Audit Log Analysis
```bash
# All events for a trace
grep '"traceId":"abc123"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .

# All errors today
grep '"eventType":"error"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .

# High latency requests (>5s)
grep '"llm_response"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq 'select(.timing.totalMs > 5000)'

# Media generation failures
grep '"media_response"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq 'select(.statusCode >= 400)'
```

```sql
-- Cost audit
SELECT "traceId", "modelUsed", "costUsd", "creditsCharged", "errorMessage"
FROM provider_usage_log
WHERE "createdAt" > NOW() - INTERVAL '7 days' AND "traceId" IS NOT NULL
ORDER BY "createdAt" DESC;
```

## Anti-Patterns to Flag

| Anti-Pattern | Correct Approach |
|---|---|
| Changing code without reading error | Read and quote exact error first |
| Fixing symptom not root cause | Trace call chain to find actual break |
| Editing 5 files for 1 bug | One file, test, then next if needed |
| Adding try/catch to suppress | Fix the cause, don't hide it |
| Guessing types or API shapes | Read the type definition or source |
| "Let me try different approach" without knowing why first failed | Explain WHY first approach failed |

## Historical Bugs (Reference)

### Preview Black Screen (Fixed: commit 94dfc69)
**Root Cause:** `index.css` lines 384-398 had `[aria-label*="preview"]` selector with `display: none !important` that matched `aria-label="Video preview"` on the video container.
**Why 6 attempts failed:** All prior fixes targeted CSS flex/height/width — but `!important` declarations overrode ALL normal CSS.
**Diagnosis that worked:** Added console.log showing `vc: 0x0` (container zero dimensions despite parent having space), then searched `index.css` for attribute selectors.
**Lesson:** When element has 0x0 dimensions despite correct CSS, check for global `display: none !important` or `height: 0 !important` overrides.
