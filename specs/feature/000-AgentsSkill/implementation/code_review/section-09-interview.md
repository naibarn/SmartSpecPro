# Code Review Interview: Section 09

## Review Verdict: APPROVE_WITH_FIXES

## Interview

No user input required — all fixes are clear auto-fixes with no design tradeoffs.

---

## Fixes Applied

### M1 — Specialist auditor "return to orchestra" routing instruction — AUTO-FIX
Removed "Return Result Report to orchestra — not to security-review directly." from the end of `ssp-security-trpc.md`, `ssp-security-fastapi.md`, and `ssp-security-frontend.md`. This instruction is confusing for standalone auto-dispatch invocations where no orchestra context exists. The output format table already specifies what to produce.

### L1 — ssp-database missing `mkdir -p .db-backups` prerequisite — AUTO-FIX
Added Step 0: `mkdir -p .db-backups` to the Database Safety Protocol block in `ssp-database.md`. Without this step, the pg_dump backup would fail on a fresh environment.

### L2 — ssp-infrastructure missing smartspec-nginx-dev — AUTO-FIX
Added `smartspec-nginx-dev` (Nginx Docker container) to the service architecture diagram in `ssp-infrastructure.md` with a note that it's required for public domain access. This matches the CLAUDE.md CRITICAL DEPLOYMENT RULES.
