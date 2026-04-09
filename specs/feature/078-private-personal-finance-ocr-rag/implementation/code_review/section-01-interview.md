# Code Review: Section 01 - Schema and Migrations

**Date:** 2026-04-09

## Auto-Fixes

- Removed `projectId` from `financeStructuredDraftSchema` so structured output cannot override the authenticated finance scope.
- Added positive DB checks for finance amounts and OCR page counts to keep the data layer fail-closed.

No user decision was required for this section.
