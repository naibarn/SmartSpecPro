# Request

## Task

Normalize email addresses to lowercase and trimmed form whenever they are
stored or used by email authentication/recovery flows, then harden the related
login and reset-code bugs found during the investigation.

## Constraints

- Preserve unrelated dirty Feature 141 work.
- Do not use Gmail dot/plus alias collapsing for auth identity.
- Migration must fail safely when logical duplicate primary emails exist.
- SMS token rows reuse the token email column for phone values and must not be
  lowercased or trimmed by an email migration.
- No deploy, push, or commit is requested in this implementation pass.

## Acceptance summary

- Mixed-case/whitespace email input can authenticate legacy users.
- New and updated primary/backup email values are canonical lowercase.
- Forgot/reset/verification flows use the same canonical value.
- Invalid reset codes are client errors, not internal server errors.
- OAuth-only users cannot use arbitrary password login.
- Focused auth tests, typecheck, and migration verification pass.
