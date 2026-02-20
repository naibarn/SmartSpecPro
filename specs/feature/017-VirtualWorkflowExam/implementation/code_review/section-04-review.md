# Section 04 Code Review: Seeder Script

## Overall Assessment

The implementation is functional and largely follows the spec. The script has been demonstrated to run successfully with 60 templates seeded idempotently. However, there are several issues ranging from a logic bug that silently miscounts results to missing test coverage that the spec explicitly required.

---

## HIGH SEVERITY

### 1. Counting logic bug in seedTemplates (line 282-286)

When a template upserts successfully but SVG generation failed (`previewSvg === null`), the template is counted as `warned` but never as `ok`. No `[OK]` log line is printed for it either. The total happens to be correct by coincidence because every template is counted exactly once, but the `ok` count conflates 'SVG generated' with 'DB row upserted'.

### 2. Timer leak in generateSvgWithTimeout (line 115-126)

When `generateWorkflowSvg` completes before the timeout (expected for all 60 calls), the `setTimeout` timer is never cleared. 60 dangling timers accumulate, potentially keeping the event loop alive after script completion.

---

## MEDIUM SEVERITY

### 3. System user created with role 'admin' (line 174)

The spec says to use `role: 'system'` or closest available. No 'system' role exists in the enum (`["user", "admin", "domain_admin"]`). Implementation chose 'admin' but 'user' would be safer since this account should never log in.

### 4. Test queries by email not openId (test line 72-75)

Implementation correctly uses `openId` as conflict target (since `email` has no unique constraint), but the test queries by `email`. Should be consistent.

### 5. Manual .env parser instead of dotenv (lines 19-31)

The spec said to use `import 'dotenv/config'`. Manual parser doesn't handle multiline values, `export VAR=value` syntax, etc.

### 6. Missing test: idempotency update verification

Spec requires verifying "modified name in template JSON is reflected in updated DB row". This test is absent.

### 7. Missing test: error resilience / exit code tests

Spec requires SVG failure resilience and exit code 1 on DB failure. Neither is tested.

### 8. Category count assertion too weak (test line 82-83)

Uses `toBeGreaterThanOrEqual(15)` instead of exact `toBe(15)`.

---

## LOW SEVERITY

### 9. Unused `count` import in test file

### 10. No runtime validation of JSON shape after JSON.parse

### 11. categoryId not in onConflictDoUpdate set clause

### 12. Tests modify production DB with no cleanup

### 13. Strict regex may skip valid files

---

## Recommendations

1. **[HIGH]** Fix counting: always log and count on successful DB upsert, SVG warning is separate
2. **[HIGH]** Clear the timeout timer in generateSvgWithTimeout
3. **[MEDIUM]** Change system user role to 'user'
4. **[MEDIUM]** Fix test to query by openId instead of email
5. **[MEDIUM]** Fix category count assertion to `toBe(15)`
6. **[LOW]** Remove unused `count` import
7. **[LOW]** Add categoryId to onConflictDoUpdate set
