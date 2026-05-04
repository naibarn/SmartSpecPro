[2026-05-04T03:04:50Z] DECISION: Start fresh Orchestra session for skill prompt refinement.
  Context: Existing orchestra files were present without snapshot.json, so prior session files were archived under orchestra/archive/20260504T030450Z/.
  Alternatives considered: Resume was unavailable because no snapshot.json existed.

[2026-05-04T03:04:50Z] DECISION: Use direct-edit route.
  Context: Scope is small, risk is low, and the implementation target is limited to prompt-template Markdown files.
  Alternatives considered: quick-plan-chain would add process without reducing risk for this focused template update.

[2026-05-04T03:16:00Z] DECISION: Treat visual-only mouth lock as the sole allowed speech-related wording in separate-audio prompt blocks.
  Context: Previous rules prohibited speech/audio instructions in separate-audio blocks, while the requested improvement requires preventing accidental lip-sync. The lock is visual guidance, not audio-generation guidance.
  Alternatives considered: Avoiding mouth-lock wording would leave the prior lip-sync risk unresolved.

[2026-05-04T03:34:00Z] DECISION: Update both the active installed Orchestra skill and the repo mirror.
  Context: Future invocations in this Codex environment read `/home/dev/.codex/skills/orchestra/SKILL.md`, while repo history tracks `skills/orchestra/`. Keeping both aligned avoids a mismatch between active behavior and committed skill pack behavior.
  Alternatives considered: Updating only the repo mirror would not affect the current installed skill; updating only the installed skill would leave the repository copy stale.
