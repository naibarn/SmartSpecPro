# Section 02 — Admin UI

Ownership:

- `apps/web/client/src/components/admin/MetaOAuthSettingsPanel.tsx`
- `apps/web/client/src/pages/AdminSettings.tsx`

## UI/UX Contract

- Target user: platform admin configuring Facebook Pages integration.
- Job: move from no Meta app to a tested configuration and know the exact next
  action without consulting source code.
- Surface inventory: readiness banner, credentials form, webhook form,
  permissions summary, numbered setup guide, save/test actions.
- Component map: Astryx Section/Grid/VStack/HStack/TextInput/Banner/Badge/Button/
  Text/Heading/Divider/Link inside the existing OAuth tab.
- State matrix: loading, incomplete, ready, saving, testing, success, error,
  configured secret, unconfigured secret.
- Responsive matrix: one column below 768px; paired fields and guide/status rail
  on tablet/desktop; controls remain at least 44px.
- Accessibility: visible labels, semantic heading order, keyboard actions,
  persistent actionable errors, external-link labeling, copy buttons named.
- Existing pattern reference: Admin Settings OAuth providers and header
  LocaleToggle; reuse locale state and toast conventions.
- Copy contract: complete English and Thai strings selected by current locale;
  no raw translation keys; errors explain how to fix the field; secrets are
  described as write-only.
- Browser evidence: mobile 390x844, tablet 768x1024, desktop 1440x900; verify
  focus, overflow, locale switch, loading/error/disabled states.

Acceptance:

- The existing language switcher updates Meta content immediately.
- Callback URLs and permissions are visible and copyable.
- One dominant Save action and one secondary Test action.
- No secret value is populated from the server.
