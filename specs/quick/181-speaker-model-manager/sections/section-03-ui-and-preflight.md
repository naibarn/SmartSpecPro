# Section 03 — Runtime UI

Add a speaker model setup card to the Runtime route in `apps/worker-app/src/main.tsx`
with a per-adapter state matrix, native file selection, clear/recheck actions,
manual instructions, and accessible status/error copy. Wire the speaker-aware
submit flow to the new preflight command and show remediation before queueing.

UI/UX Contract: target user is a Worker operator fixing local model readiness;
states are loading, healthy, missing model, missing dependency, GPU unavailable,
license/token required, and error; responsive layout is single-column on narrow
windows and two-column on wide windows; all controls need labels, focus states,
keyboard access, and copyable instructions. Browser evidence must cover each
blocked and healthy state without fake provider output.
