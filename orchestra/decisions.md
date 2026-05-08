# Orchestra Decisions

[2026-05-08T01:28:43Z] DECISION: Run read-only security audit using installed-skill-flow.
  Context: User explicitly invoked orchestra and requested security inspection of the current codebase.
  Alternatives considered: Full implementation/remediation flow; deferred until findings are reviewed or requested.

[2026-05-08T01:28:43Z] AUTO-APPROVED: Archive stale orchestra session and start fresh audit session.
Reason: auto_by_default mode active
Risk: LOW
Files affected: orchestra/

[2026-05-08T01:40:00Z] DECISION: Stop at security audit verdict instead of applying fixes.
  Context: The task requested inspection, and critical secret/dependency findings required coordinated rotation/remediation.
  Alternatives considered: Auto-remediate repository files; deferred because secret rotation/history cleanup can have external side effects.

[2026-05-08T02:35:00Z] DECISION: Apply immediate repo-local security remediation after user approval.
  Context: User requested immediate improvement of discovered issues.
  Changes: Removed tracked SQL backup from worktree, added SQL backup ignore patterns, closed Kie webhook fail-open paths, revalidated media redirect targets, redacted callback payloads, added voice-agent rate limiting, pinned selected mutable GitHub Actions refs, and reduced production npm audit severity.
  Limits: External secret rotation, git history cleanup, Docker socket redesign, CSP hardening, and `xlsx` replacement remain follow-up work.

[2026-05-08T02:35:00Z] DECISION: Do not force-upgrade incompatible audit fixes automatically.
  Context: `npm audit` recommends breaking changes for some residual advisories and reports no fix for `xlsx`.
  Rationale: Force upgrades could break runtime behavior; record residual risk and leave package replacement/compatibility work as explicit backlog.
