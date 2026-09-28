# TDD Guidance

1. Add service tests for the publication eligibility matrix and Gallery payload
   key mapping; start with failing admin/non-admin and missing-key cases.
2. Add router tests for mutation exposure and actor/tenant enforcement.
3. Extend `DocumentPreviewPanel.test.tsx` with admin callback visibility,
   unsupported-item hiding, pending disable, and callback invocation.
4. Run the existing public Gallery media route tests to protect stable delivery
   and byte-range video behavior.

Mocks should keep storage and DB boundaries deterministic. No production or
browser credentials are required for these tests.
