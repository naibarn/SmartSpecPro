# Finalization

After all sections are implemented, committed, and cross-section integration review is complete.

## Security Scan (Automatic — Before Quality Pass)

Run `git diff main...HEAD --name-only` to get changed files. If ANY of these patterns match, dispatch a security scan:

| Changed File Pattern | Action |
|---------------------|--------|
| `routers/*.ts` | Check IDOR, missing auth, missing Zod validation (ref: `skills/cybersecurity/exploiting-idor-vulnerabilities.md`) |
| `python-backend/app/` | Check command injection, SQL injection, secrets in logs (ref: `skills/cybersecurity/exploiting-sql-injection-vulnerabilities.md`) |
| `client/src/` | Check XSS, token storage, VITE_ secrets (ref: `skills/cybersecurity/testing-for-xss-vulnerabilities.md`) |
| `crypto.ts`, `*Encrypted` | Check AES-GCM correctness (ref: `skills/cybersecurity/implementing-aes-encryption-for-data-at-rest.md`) |
| `middleware/*`, `lib/jwt*` | Check JWT validation, auth bypass (ref: `skills/cybersecurity/exploiting-jwt-algorithm-confusion-attack.md`) |
| LLM/skill files | Check prompt injection (ref: `skills/cybersecurity/performing-directory-traversal-testing.md`) |

**Procedure (auto, no confirmation):**
1. Scan changed files against checklist in `skills/cybersecurity/SECURITY-AUDIT-PROTOCOL.md` (ชั้นที่ 1 checklist)
2. CRITICAL findings → [AUTO-FIX] immediately, commit
3. HIGH findings → [AUTO-FIX] if 80%+ confident, else [SUGGEST]
4. MEDIUM/LOW → [SUGGEST] only
5. Log all findings in finalization output

## Final Quality Pass & Auto-Improve

Before generating output, do one final sweep:

1. Re-read all section plans and compare against actual implementation
2. Run full test suite (`{test_command}`)
3. For each improvement opportunity:
   - **[AUTO-FIX]** (80%+ confident it should be done) → fix and commit immediately:
     - Missing error handling that's clearly needed
     - Incomplete input validation at system boundaries
     - Missing tests for public functions/endpoints
     - Inconsistent naming that was missed in per-section reviews
     - Dead code or unused imports
     - Obvious type safety improvements
   - **[SUGGEST]** (genuinely optional) → collect for summary:
     - Performance optimizations that depend on usage patterns
     - Additional test scenarios beyond core coverage
     - Documentation enhancements
     - Refactoring opportunities that aren't blocking

4. Apply all [AUTO-FIX] items
5. Re-run tests to verify
6. If fixes needed a new commit:
   ```bash
   git add -u && git commit -m "fix: final quality pass — auto-improvements"
   ```

**Rule: If you're 80%+ confident it should be done → just do it.** Only genuinely optional or ambiguous items go to [SUGGEST].

**Cadence rule:**
- do at least 5 review rounds
- allow up to 7 rounds if findings keep surfacing
- each round must check completeness, security, and obvious extra improvements
- stop only after 2 consecutive rounds with no [AUTO-FIX] findings

---

## Post-Completion Self-Revision

After the final quality pass succeeds, do one more self-revision round before declaring completion.

This pass is intentionally different from bug-fixing:
- you are no longer asking "does it pass?"
- you are asking "now that the full feature exists, what should be revised?"

### Revision Checklist

- Is any code awkward because it was written section-by-section rather than as a finished whole?
- Did review fixes create naming drift or duplicated logic?
- Is there cleanup or consolidation that is now clearly safe?
- Is there a missing integration test that only became obvious at the end?

### Procedure

1. Re-read the final changed files and section plans together
2. Identify:
   - **[AUTO-FIX]** low-risk revisions that clearly improve the result
   - **[SUGGEST]** optional or product-sensitive revisions
3. Apply all [AUTO-FIX] revisions
4. Re-run relevant tests
5. Repeat this revision pass until stable:
   - target 5 rounds
   - max 7 rounds
   - require 2 consecutive no-op rounds before stopping
6. If code changed materially, create a final revision commit:
   ```bash
   git add -u && git commit -m "refactor: final revision pass"
   ```

The workflow should not end immediately after the first green build if this revision pass reveals something clearly worth fixing.

---

## Generate usage.md

Introspect the implemented code to create a usage guide:

1. List all files created during implementation
2. Identify main entry points (CLI commands, API endpoints, main functions)
3. Generate example usage based on the implementation
4. Write to `{state_dir}/usage.md`

```markdown
# Usage Guide

## Quick Start

[Generated from implemented code - show how to run/use what was built]

## Example Output

[Hypothetical output - actual results may vary]

## API Reference

[Generated from implemented code - document public interfaces]
```

The usage guide should be practical and help someone actually use what was built.

---

## Output Summary

Print a completion summary:

```
═══════════════════════════════════════════════════════════════
DEEP-IMPLEMENT COMPLETE
═══════════════════════════════════════════════════════════════

Sections implemented: {N}/{N}
Commits created: {N}
Reviews: {N} per-section + 1 cross-section integration
Quality: {M} auto-improvements in final pass

Generated files:
  {implementation_dir}/
  ├── code_review/
  │   ├── section-01-diff.md
  │   ├── section-01-review.md
  │   └── ...
  └── usage.md

Git commits:
  {hash1} Implement section 01: Name
  {hash2} Implement section 02: Name
  ...
  {hashN} fix: final quality pass — auto-improvements

Next steps:
  - Review {implementation_dir}/usage.md
  - Run full test suite: {test_command}
  - Create PR if ready

{If SUGGEST items exist:}
───────────────────────────────────────────────────────────────
Optional suggestions (non-critical):
  • {suggestion 1}
  • {suggestion 2}
───────────────────────────────────────────────────────────────
═══════════════════════════════════════════════════════════════
```
