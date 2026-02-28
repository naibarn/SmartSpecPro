# Section 11 - Code Review Interview

## Auto-Triage Summary

User instruction: "Auto-decide everything except security issues."

### FIXED (Security + Important)

1. **[CRITICAL] SQL Injection in adminGetMetrics/adminGetAlerts** — Fixed by replacing `sql.raw()` string interpolation with Drizzle parameterized `sql` tagged templates using `sql.join()` for conditions.

2. **[MEDIUM] Upsert race in adminSetQuotas** — Wrapped delete+insert loop in `db.transaction()`.

3. **[MEDIUM] Kill switch missing 'queued' status** — Changed `status: "running"` to `status: "running,queued"` in agencyBridge.listRuns call.

4. **[MEDIUM] Purge unbounded DELETE** — Refactored to batch deletes using `ctid IN (SELECT ctid ... LIMIT 1000)` pattern with do-while loop.

### LET GO (Deferred / Not Critical for MVP)

- #4: No archival scheduling — noted limitation, scheduling is deployment concern
- #6: Credit reconciliation stub — intentional stub
- #7: Missing event type in Node auditLogger — Python-only log
- #8: Missing 3 of 5 alert thresholds — MVP covers success_rate
- #9: Shallow admin tests — schema validation sufficient
- #10: Quota form state sync — cosmetic UX issue
- #11: Tool whitelist tab read-only — edit UX deferred
- #12: `as any` casts — raw SQL inherently untyped
- #13: check_alert_thresholds null agency — noted limitation
- #14: Archival ignores per-tenant archive days — default sufficient
- #15: Missing credit limit test — different concern
