# SPEC-224 Task Control model selector repair — 2026-10-29

## Root cause and repair

The authenticated Task Control screenshot showed a fresh Runner catalog but only rendered `Auto · <default model>` as static text. `Spec224WorkspacePanel` deliberately replaced the AI Model Selector with read-only text in Simple Mode. In addition, `effectiveModelPolicy` forced `auto` whenever `simpleMode` was true, so even a visible selection would have been discarded when Start built its request.

At source SHA `39560ef7d579625b377d0304a55e6b64765c0f95`, Simple Mode now uses the same catalog-backed AI Model Selector as Developer Mode. Auto remains the default and displays the Runner-reported default model. Explicit model selection is carried through Start; the selected model's supported default reasoning effort is used in Simple Mode. The component still disables selection unless the Runner catalog is discovered, fingerprinted, revisioned, current, and has models. No model or entitlement data was hardcoded and no entitlement validation was bypassed.

## Verification

```text
JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm --dir apps/web exec vitest run client/src/components/chat/Spec224WorkspacePanel.test.tsx
```

Result: 1 file, 24 tests passed. The new Simple Mode test opens the selector, confirms it offers only Runner-catalog models, selects a non-default model, and verifies Start receives that exact model ID and its catalog-supported effort.

The development host's `aimarkethubs.com` tunnel ingress maps to `http://127.0.0.1:3100`. The dev origin and public Task Control route both returned HTTP 200, and fetching the served `Spec224WorkspacePanel.tsx` module through both local port 3100 and `https://aimarkethubs.com` showed the new selector and explicit-model selection handler. This verifies current dev serving source; an authenticated browser click through the live dropdown was not performed in this host session.

The separate `smartspec-web.service` is the production release target. It was not restarted or promoted. SPEC-224 owner Goal Start/Approval and genuine Child 1/2 receipts, automatic continuation, settlement and Final Verify remain outstanding.
