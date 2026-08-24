# Implementation Plan

## Objective

Replace both legal pages with aligned bilingual content and localized metadata while preserving
the existing public-page shell.

## Files

- Add `apps/web/client/src/lib/legalContent.ts` with typed document/section data for English and
  Thai, shared contact constants, and stable section IDs.
- Replace `apps/web/client/src/pages/Privacy.tsx` with a locale-aware renderer and localized SEO.
- Replace `apps/web/client/src/pages/Terms.tsx` with the same renderer pattern and localized SEO.
- Add `apps/web/client/src/lib/legalContent.test.ts` for parity, verified facts, and unsupported
  claim guards.

## Acceptance criteria

- Both pages display Thai when the active locale is `th` and English for `en`/fallback.
- Every section has the same stable ID/order in both languages.
- The pages identify `Smart AI Hub Team`, use `smartaihubapp@gmail.com`, and link to Contact.
- Legacy unverified mailboxes and unsupported SOC/GDPR/AES/fixed-retention claims are absent.
- Long legal content remains visible and wraps on mobile.
- Focused tests, formatting, diff checks, and targeted TypeScript verification pass or baseline
  noise is clearly separated.

## Risks and mitigations

- Legal identity is temporary: label it as the current operator/controller and record residual
  risk for replacement after entity confirmation.
- Future product data flows may change: avoid false fixed claims and keep copy categories broad.
- Locale regressions: test section alignment and render a locale-dependent heading.
