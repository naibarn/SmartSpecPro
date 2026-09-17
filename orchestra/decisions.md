[2026-09-17T14:05:30+07:00] DECISION: Use the existing Worker App Windows release script and derive the next patch version.
  Context: package.json and tauri metadata are 0.1.402; the highest Dashboard installer is also 0.1.402.
  Alternatives considered: generic release skill GitHub/tag/npm flow was out of scope for a Dashboard artifact request.

[2026-09-17T14:05:30+07:00] DECISION: Preserve the dirty worktree and avoid reset/commit/push.
  Context: unrelated existing changes are present, including Worker App source edits; the user asked for build and placement only.
  Alternatives considered: clean/reset or commit all changes would risk changing user-owned work and exceed scope.

[2026-09-17T14:09:10+07:00] DECISION: Accept the cross-build artifact as the Dashboard release while reporting host limitations.
  Context: cargo-xwin and NSIS completed, the runtime gate passed, and the live Dashboard latest/download endpoints returned byte-identical 0.1.403 artifacts.
  Alternatives considered: Windows signing and install acceptance require a Windows host and are outside this Linux build environment.
