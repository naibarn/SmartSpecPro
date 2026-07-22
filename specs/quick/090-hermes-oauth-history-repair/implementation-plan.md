# Implementation plan

## Objective

Restore xAI device authorization on Windows while retaining secret isolation,
then make connection history compact and understandable.

## Approach

1. Add required Windows path variables to the explicit Hermes child allow-list.
   Replace whole-line masking with a bounded secret-redacting diagnostic
   extractor and cover both behavior and leakage cases.
2. Partition Settings rows into actionable and terminal history. Add a
   controlled, collapsed disclosure showing five rows at a time; filter admin
   rows to central scope and localize all new copy.
3. Raise the desktop Hermes minimum to 0.1.132, build the installer, deploy web
   and release assets, and verify production status through DB/events/health.

## Risks and mitigations

- Environment leakage: only named non-secret path variables are copied.
- Diagnostic leakage: redact sensitive key/value patterns, URL query values,
  device codes, and long opaque strings; test representative secrets.
- UI regression: preserve existing active row controls and connect error flow.
- Dirty worktree: edit only named files and use targeted tests/diffs.

## Acceptance criteria

- Worker emits an xAI device-code event instead of an immediate traceback.
- No token, refresh token, device code, or password appears in server events.
- History is collapsed by default, limited to five, expandable, localized, and
  keyboard accessible.
- Admin central section contains no private connection rows.
- Worker App 0.1.132 is served by production and older versions cannot claim
  desktop Hermes jobs.

