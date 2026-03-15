# Interview Notes

Date: 2026-03-11

## Q1. When should downstream artifacts be written?

Show a structured preview first and require explicit user confirmation before writing downstream deck, storyboard, or report records. Treat the agent output as an ephemeral run result until the user clicks confirm or promote. This keeps creation intentional, avoids storage noise, and cleanly separates “generation succeeded” from “artifact committed.”

## Q2. What should the default research retrieval scope be?

Use mixed mode. Let templates define the default retrieval scope, but allow the user to expand or narrow it per run within tenant permissions. This gives sane defaults for consistency while preserving flexibility for power users and special cases.

## Q3. What should always persist versus only persist on save?

Use a hybrid persistence policy: always persist run and provenance metadata, but only persist user-facing artifacts when the user chooses to save or promote. In practice, successful runs should always write immutable audit data such as inputs, scope, citations or provenance, model and config snapshot, timestamps, and status, but deck, storyboard, and report records should only be created on explicit save or commit.

## Q4. How should the three experiences ship initially?

Ship as built-in platform templates that tenants clone into editable drafts. This gives a strong curated starting point, avoids mutating the platform canonical version, supports tenant customization safely, and preserves a clean upgrade path later without making the initial experience too rigid.
