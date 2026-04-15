# section-03-admin-settings-ui

## Purpose

Expose the new OCR routing controls in the admin settings page without breaking the existing Document OCR experience.

## Files in scope

- `apps/web/client/src/pages/AdminSettings.tsx`
- optionally `apps/web/client/src/components/admin/DocumentOcrSettingsPanel.tsx`
- related admin settings tests under `apps/web/client/src/pages/__tests__/` or `apps/web/client/src/components/admin/__tests__/`

## Implementation notes

1. Load the new OCR routing keys with the existing document OCR settings query.
2. Render provider selectors for image and PDF OCR.
3. Render a secure Typhoon API key field.
4. Show the existing OCR credits control unchanged.
5. Make it clear when tenant policy disables external OCR.
6. Keep the save actions independent so one routing choice does not overwrite the other.
7. Preserve the current masking behavior for configured secrets.
8. Reuse the existing tenant feature flag hook/query to surface the blocked state.

## Acceptance criteria

- Admins can configure image and PDF routing separately.
- Typhoon secret entry remains hidden after save.
- The page still works for deployments that only use LandingAI today.
