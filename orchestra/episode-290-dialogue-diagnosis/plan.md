# Episode 290 dialogue diagnosis

## Classification

- scope: diagnostic
- risk: low for read-only inspection; no database mutation, retry, or paid generation
- bug_route: true
- route: direct-standard-light
- socraticode: unavailable; bounded shell and read-only PostgreSQL fallback

## Evidence ledger

- target: series 53, episode row 290, `SPECIAL 05`
- persisted input: `specialData.input.dialogueMode = none`, empty `speakerCharacterIds`, empty `dialogueBrief`
- persisted result: skill succeeded, 9 shots, `script` is null, `dialogueAudioPlan` is null, storyboard has 9 shots
- raw debug result: parse failure and semantic retry occurred, then `job_succeeded`; final accepted output has `dialogue.mode = none` and zero speaking turns
- code contract: special tie-in episodes bypass the normal episode pipeline; the special adapter rejects dialogue when mode is `none`
- likely UI path: selecting a marketplace idea sets dialogue mode to `none` when no selected character matches its dialogue speakers

## Safety

- no writes performed
- no retry or provider call triggered
- unrelated dirty worktree preserved
