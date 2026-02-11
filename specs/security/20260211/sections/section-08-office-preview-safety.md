# Section 08 - Office Preview Safety

## Objective
Prevent forwarding private/internal URLs to external office viewer while preserving safe public preview behavior.

## Scope
- Strengthen host classification logic used by office preview decision path.
- Expand local/private coverage (IPv4/IPv6/internal hostname cases).
- Keep fallback UX deterministic when blocked.

## Files to Add / Modify
- Add: `apps/web/client/src/lib/previewHostSafety.ts`
- Add: `apps/web/client/src/lib/previewHostSafety.test.ts`
- Modify: `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`

## TDD Stubs (Write First)
- Test: localhost/private/internal hosts are blocked for office viewer.
- Test: public hosts are allowed.
- Test: malformed URLs fail closed.
- Test: blocked case shows fallback UI path.

## Implementation Tasks
1. Centralize host safety classification in client utility.
2. Replace ad-hoc checks in preview component.
3. Ensure fallback path remains user-friendly and explicit.

## Acceptance Criteria
- No private/internal URL is embedded in office viewer.
- Public office preview behavior remains functional.

## Notes / Risks
- Keep logic aligned with server-side host safety where possible.

## As-Built (Implemented)
- Added centralized office preview host-safety utility:
  - `apps/web/client/src/lib/previewHostSafety.ts`
  - `apps/web/client/src/lib/previewHostSafety.test.ts`
- Replaced ad-hoc host checks in preview component:
  - `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`

## Deviations From Plan
- Fallback behavior is validated at utility level (decision + message contract) instead of component rendering tests.

## Test Evidence
- `bash -lc 'export NVM_DIR=\"$HOME/.nvm\" && [ -s \"$NVM_DIR/nvm.sh\" ] && source \"$NVM_DIR/nvm.sh\" && cd apps/web && npm test -- client/src/lib/previewHostSafety.test.ts client/src/lib/documentManagementUi.test.ts'`
- Result: pass (10 tests)
