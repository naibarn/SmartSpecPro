# Section 03 code review

Status: reviewed by the main conductor.

- Worker status projection distinguishes waiting-agent, capability-blocked,
  retrying, degraded, QC, stale, and terminal states.
- Output links require a terminal status, an output ref, accepted verification,
  and no QC/stale/blocking reason.
- Runtime, worker, and pinned revision remain visible after project edits.
- Cancel is server-permission driven; retry is guidance only and does not
  fabricate an unavailable retry endpoint.
- The editor remains open after submission; queue navigation is explicit.

Finding closed during review: `completed + qc_blocked` could otherwise appear
ready from an output ref alone; output gating now rejects blocking reasons.
