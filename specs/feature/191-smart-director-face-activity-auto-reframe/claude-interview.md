# Deep-plan interview record

No blocking clarification was needed. The user explicitly selected the
following decisions in the request and the approved Feature 191 spec:

- Replace the old automatic behavior with Face + Activity.
- Keep the existing on-screen Mark-point function working.
- Support face, person/hand, and object tracking through capability-gated
  evidence rather than trusting a transport payload.
- Provide two modes: immediate Quick analysis and Full Scan planning across the
  entire video before rendering.
- Full Scan is authoritative when complete; Quick is provisional and remains a
  truthful fallback.
- Do not run `npm typecheck` because of RAM constraints; use focused tests,
  Rust/Python checks, and static/diff validation instead.

The implementation must preserve unrelated dirty worktree changes and must not
change Feature 189 ownership or create a second job ledger.
