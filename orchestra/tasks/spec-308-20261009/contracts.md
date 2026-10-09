# SPEC-308 Work Package Contracts

## WP1 Mascot renderer
- Owns only `apps/web/client/src/components/assistant-mascot/**` and its colocated tests/assets.
- Exports one shared renderer with stable style IDs `droplet | star | shield | chat | orbit` and presentation props (expression and motion class only); no auth, notification, routing or persistence access.
- SVGs are local, original, static vector markup: no script, external URL, foreignObject, title/body notification text, or interactive focus target.
- Consumers own button semantics and accessible label; renderer is decorative (`aria-hidden`, non-focusable).
- Must render distinct at 24/32/40 CSS px and use reduced-motion-safe static default.

## WP2 Attention reducer
- Owns only `apps/web/client/src/lib/notificationAttention.ts` and colocated tests.
- Input is a normalized authorized projection only: opaque stable per-user notification key, trusted documented category/severity, version, and scope generation. It never accepts raw body/title/URL/metadata.
- Output is a single bounded attention episode and state (`INITIALIZING`, `QUIET`, `COALESCING`, `BALLOON_VISIBLE`, `COOLDOWN`, `SUSPENDED`, `DISABLED`) with explicit deadlines; no I/O, React, storage, event listener or transport.
- Initial hydration, count-only changes, duplicate/reordered IDs, old scopes, reconnect, hidden tab and unverified categories produce no false episode.
- Repeated occurrence of the same notification row does not count as a distinct arrival; per-occurrence attention is not supported by current server contract.

## Cross-surface invariants owned by conductor
- Bell and balloon targets open existing notification UI/route; mascot opens the existing FeedbackButton dialog.
- No new SSE, polling, tRPC query, mutation, read action, LLM call, credit spend, backend/API or DB schema.
- Feature is OFF unless resolved tenant flag is exactly true and global visual allow switch is exactly true; unknown/error/off preserves original functionality.
- Settings preference contains no notification IDs/body and resets by tenant/user identity. No DB migration.
