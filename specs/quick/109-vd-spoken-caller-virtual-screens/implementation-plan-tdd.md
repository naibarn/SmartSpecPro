# TDD plan

## Red tests first

1. Shared helper:
   - one explicit caller with dialogue -> one vertical screen;
   - two explicit callers with interleaved dialogue -> two screens in first
     speaking order;
   - silent explicit caller remains screen-only but is not spoken;
   - speaker absent from caller refs is not inferred as a caller;
   - spoken caller is removed from physical refs without mutating inputs.
2. Start-frame prompt:
   - includes `spoken_caller_virtual_screens` and vertical/whole-shot/face
     constraints;
   - includes one separate screen directive per caller;
   - does not attach spoken caller as physical-scene reference.
3. Video motion prompt:
   - includes equivalent structured caller facts for one and multiple callers;
   - no spoken callers preserves the existing prompt path.
4. Pipeline wiring:
   - canonical deep-draft speaker order is passed to start-frame shot params.

## Test setup

Use existing Vitest helpers and direct pure function calls where possible. Do
not require database, provider credentials, or network access. Keep assertions
semantic (`toContain`, parsed directive equality) rather than snapshotting the
entire long prompt.

## Green and regression checks

Implement the smallest helper and wiring needed to make the red tests pass.
Run focused tests after each boundary change, then run `git diff --check` and
changed-file TypeScript diagnostics if available.
