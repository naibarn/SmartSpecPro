# Code Review: Section 09 — Native .claude/agents/ Definitions

**Verdict:** APPROVE_WITH_FIXES

## Summary

All 17 files present. Configuration matrix correct across all agents. No hard constraint violations. Three issues to fix.

---

## MEDIUM Issues

### M1 — Specialist auditors have "return to orchestra" routing instruction (3 files)

Files: `ssp-security-trpc.md`, `ssp-security-fastapi.md`, `ssp-security-frontend.md`

Each specialist ends with "Return Result Report to orchestra — not to security-review directly." This instruction is not in the plan stubs and creates a behavioral problem for standalone auto-dispatch: when Claude invokes these agents directly (without an orchestra context), they'll attempt to "return to orchestra" when no such entity exists.

**Fix:** Remove the routing instruction. The output format table already specifies what to produce.

---

## LOW Issues

### L1 — ssp-database missing `mkdir -p .db-backups` prerequisite

The CLAUDE.md Database Safety Protocol starts with `mkdir -p .db-backups`. The ssp-database.md protocol jumps straight to `pg_dump` — on a fresh environment this would fail with "No such file or directory."

**Fix:** Add `mkdir -p .db-backups` as Step 0 before the pg_dump command.

### L2 — ssp-infrastructure service architecture missing smartspec-nginx-dev

CLAUDE.md explicitly requires Nginx running for domain access and names its container `smartspec-nginx-dev`. The service diagram omits this tier.

**Fix:** Add Nginx to the service architecture block.

---

## Clean Checks

- All 17 YAML frontmatter fields match configuration matrix exactly
- `name:` fields match filenames (17/17)
- `ssp-security-review.md` correctly aggregates only — no Task dispatch instructions
- Read-only agents have `tools: Read, Grep, Glob` only
- Parallel writing agents have `isolation: worktree`
- No `background: true` + `permissionMode: default` violation
- All ssp-* names in README cross-reference table (17/17)
- All descriptions have trigger language (17/17)
- ssp-debugger has `maxTurns: 50` and full 3-phase protocol
