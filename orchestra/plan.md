# Orchestra Plan

## Task
Improve the `video-storyboard-to-prompts` skill so generated storyboard video prompts maintain stronger cross-clip continuity and avoid prompt issues found in the latest storyboard review.

## Classification
- scope: small
- risk: low
- affected_domains: skill prompt templates
- estimated_file_count: 3
- chosen_route: direct-edit
- task_summary: Strengthen prompt-template rules for continuity locks, reference filtering, text/logo sanitization, separate-voice visual-only prompts, presenter visibility, and final self-audit.
- bug_route: false

## Task Classification
- Scope: small
- Risk: low
- Affected domains: skill prompt templates
- Estimated file count: 3
- Chosen route: direct-edit
- Bug route: false
- Classification notes: This is a focused skill-template refinement touching only Markdown prompt files. No runtime code, API, schema, auth, or external integration changes are required.

## Activation Decision
- Explicit skill requested: orchestra.
- Intent signal: user asked to apply previous analysis as implementation work.
- Skill ownership: Orchestra owns the workflow; no deep planning chain is needed because the change is small and implementation-ready.

## Planned Edits
- Add stronger reference filtering and recurring-prop rules.
- Add deterministic continuity contract/checklist for shared notes and locks.
- Add hard text/logo/contact/chart sanitizer guidance.
- Add visual-only mouth lock for separate voice workflows.
- Require presenter visibility in one-presenter news clips.
- Replace conflicting native-audio-only reminder with workflow-conditional reminders.
- Add a final hidden QA audit before output.

## Follow-up Task
Improve Orchestra's own flow so SocratiCode is checked before repository shell exploration and used to reduce discovery tokens without weakening shell verification.

## Follow-up Classification
- scope: small
- risk: medium
- affected_domains: skill orchestration instructions
- estimated_file_count: 4
- chosen_route: direct-edit
- bug_route: false
- classification notes: This changes skill behavior/instructions, including routing/discovery guardrails, but does not modify runtime app code.
