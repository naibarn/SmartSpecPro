# Incident Postmortem — Kie.ai Duplicate API Version Path

## Summary

- **Observed:** 2026-09-13 from the media history failure detail.
- **Severity:** SEV-3 — Kie.ai image generation was rejected for affected requests; the rest of the site remained available.
- **User impact:** Image generation failed before a task was accepted. The screenshot shows zero credits used.
- **Status:** Root cause identified and a code fix prepared; production deployment and provider-path smoke verification remain operational gates.

## Root cause

The Kie media model catalog stores a request endpoint as `/api/v1/jobs/createTask`. The provider base URL is also allowed to contain `/api/v1`, and the persisted media-provider URL was only trimmed, not canonicalized. When a legacy or manually entered base URL already contained a repeated API prefix, the runtime joined both values and sent:

`https://api.kie.ai/api/v1/api/v1/jobs/createTask`

The screenshot is direct evidence of that malformed request path. The reference-image array (`input_urls`) was not the cause of this failure; the request failed at the provider URL boundary before image generation and credit settlement.

## Contributing gaps

1. Admin/provider configuration accepted a Kie base URL with repeated API roots.
2. Existing rows were not repaired when read by all runtime consumers.
3. Runtime endpoint normalization handled duplicated endpoint prefixes, but not a duplicated prefix already present in the base URL.
4. The Kie health probe used the supplied base URL directly, so it did not prove that the production request join was canonical.

## Fix and prevention

- Canonicalize Kie base URLs to exactly one `/api/v1` root before persistence and before every runtime request.
- Normalize legacy values such as the service root, `/api/v1/api/v1`, and a copied `/jobs/createTask` URL.
- Make the Kie health probe use the same canonicalization function as the runtime path.
- Use the same API-root convention for Kie Omni asset requests so that asset creation cannot reintroduce the same join bug.
- Add TypeScript and Python regression tests for duplicated base prefixes and assert the exact final request URL.

## Verification

- Python Kie provider focused suite: 62 passed.
- TypeScript media-provider utility and Kie probe tests: passed within the selected files.
- The combined router file still has one unrelated pre-existing WaveSpeed template-count failure (expected 14, current 27); it does not involve the Kie changes.
- Type checking was intentionally not run because of the available memory constraint.

## Production follow-up

1. Deploy the focused fix through the normal release gate.
2. Restart/reload the Python and Node services that read media-provider configuration.
3. Run one non-credit-consuming Kie validation request and verify logs contain only `/api/v1/jobs/createTask`.
4. Query existing Kie provider rows for `/api/v1/api/v1` or `/jobs/createTask` and repair them through the same canonicalizer; do not edit secrets or retry paid jobs.
5. Add an alert/search rule for outbound Kie URLs containing `/api/v1/api/v1` and fail the request before provider submission if one ever appears.
