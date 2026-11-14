# Focused verification ideas — assistant-ui Chat Shell

## Adapter mapping

- Map Core conversation IDs to stable assistant-ui thread IDs without string collisions.
- Map numeric Core message IDs to stable runtime IDs and preserve sender/content/attachments/model/usage/credits/time.
- Reordering, adding an earlier page, switching away/back and re-hydrating do not remount or duplicate stable message rows.
- Unsupported payload parts are rendered as safe text/fallbacks; untrusted HTML/JS never executes.

## Thread and job lifecycle

- New conversation creates one Core conversation and selects the same runtime thread.
- Switching threads changes both host selection and runtime current thread before any send callback can fire.
- Queue acceptance uses the existing idempotency key once; successful job completion reconciles persisted Core messages.
- A definitive failure preserves draft and attachments for retry; retry follows existing idempotency semantics.
- Refresh/reconnect hydrates history and does not POST a new turn. Without a server active-job lookup, do not infer or restore a job from local storage.
- UI display cancellation does not call or imply worker job cancellation.

## Attachments and presentation

- Existing image/document upload APIs, max count/size/type validation, previews/removal, Lightbox and persisted message attachment hydration still work.
- Message renderer preserves markdown/code and one-line provider/model/time metadata; credits/token details remain discoverable.
- Assistant-ui and Astryx theme/locale wrappers produce the same interaction semantics in Thai/English and all registered themes.
- Keyboard navigation, focus visibility, labels and touch controls remain operable in panel drawers at desktop/tablet/mobile breakpoints.

## Package and release checks

- Chat-only Vitest, `pnpm --filter @smartaihub/chat typecheck`, `pnpm run build:chat`, exact source artifact build and Wrangler dry-run.
- Inspect final JS/CSS artifact for accidental server-only imports, deprecated runtime use and large unused dependencies.
- Target-gated development release and HTTP health/manifest checks; authenticated browser UAT covers real user behavior if the session is available.
