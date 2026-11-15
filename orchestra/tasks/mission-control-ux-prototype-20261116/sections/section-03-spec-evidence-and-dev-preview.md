# section-03-spec-evidence-and-dev-preview

- requirement_ids: REQ-294-UW2-07, REQ-294-OWNER-UX-05, SPEC-312 R1.24 handoff boundary
- objective: Produce interaction-flow documentation, component inventory, SPEC-294 requirement-to-UI mapping, gap matrix, and integration proposal; capture target viewport screenshots; run focused build; release to modular-debian-dev using its registered controller only; verify target and preserve existing routes; update canonical SPEC-294 handoff as partial evidence only.
- owned paths: `orchestra/tasks/mission-control-ux-prototype-20261116/**`; SPEC-294 existing handoff evidence/manifest/ledger via shared writer only; Platform release artifacts produced by registered controller, not manually edited.
- prerequisites: sections 01 and 02 integrated and focused checks pass.
- completion predicate: documents and screenshots stored; release is demonstrably aimarkethubs.com / modular-debian-dev; prototype path works while `/chat` and current Mission/Task routes remain unchanged; `OWNER_UAT_PENDING` and SPEC-312 non-completion remain explicit.
- verification: inspect deployment target registry and controller receipt, verify live health/routes and preview path. No production deployment.
- expected evidence: screenshot files, interaction/gap docs, exact release manifest/source SHA and handoff writer result.
- fallback/substitution: If release controller or hosted session is unavailable, report SOURCE_READY / RUNTIME_PENDING with exact next step; do not claim a preview URL is live.
- blocker challenge: Never route to legacy Debian or Cloudflare; no alternate deploy mechanism.
- waiting/reactivation: Reattempt only on concrete controller/release dependency change.
