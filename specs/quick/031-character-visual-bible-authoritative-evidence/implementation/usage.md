# Usage and verification

The existing `verticalDramaCharacters.previewCharacterPrompt` flow requires no client or
API change. When the LLM reports incorrect cast/archive bookkeeping, the service now uses
the bounded server context and continues with the validated creative payload.

Verify locally:

```text
cd apps/web
npm test -- server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts
npm run check
```

At implementation time the first full typecheck passed. A later rerun encountered unrelated
workspace dependency duplication errors; use a clean dependency installation before treating
those global diagnostics as a release gate for this fix.

Production verification after deployment: open `/drama-series/7`, generate the character
prompt for พิมพ์ดาว, and confirm prompt preview completes without the prior comparison
evidence schema error or an evidence-only LLM retry.
