# TDD plan — special tie-in episode

Tests are written before each implementation section using Vitest conventions already
present in `apps/web`. Test doubles must inject Redis, database, skill execution, media
authorization, and provider boundaries; no live provider or production mutation is part
of focused tests.

## 1. Shared contracts and persistence

- Episode kind default/backward-compatible parse.
- Special input bounds, duration enum including 12, 9:16, reference/cardinality and
  dialogue limits.
- Special sequence allocation is atomic, scoped, monotonic, tenant-safe, and non-reusing.
- Migration contains idempotent additive statements and normal backfill semantics.
- Start-frame/motion output round-trip preserves special shot count and model snapshot.

## 2. Creation and reconciliation

- Same `createIntentId` returns one episode under retries/races.
- Separate normal and special sequences; deletion does not reuse special sequence.
- Cross-tenant series/character/media access is rejected.
- Input update invalidates output and stale worker result cannot commit.
- Queue active pointer/idempotency and status transitions are correct.
- Normal creation functions are not called by the special service.

## 3. Marketplace and managed references

- Product query/filter/pagination maps to `listProducts`.
- Product selection loads `listProductImages` and displays typed sources.
- Exactly 1–3 confirmed references and aggregate limit enforcement.
- Pending product changes do not erase confirmed selections.
- Upload becomes managed media; raw URL-only input is rejected/imported, never canonical.
- Location/store slot reconciliation is idempotent and reusable.
- Resolved runtime URLs are authorized and bounded.

## 4. Skill contract and adapter

- Local package files load in stable order; missing file fails clearly.
- Special-only 12-second input passes while normal profile remains unchanged.
- Reference IDs are stable and URL values are execution-only.
- Locked person/product/location references are propagated.
- Output validation rejects malformed status, shot count, numbering, durations, and
  dialogue mismatch.
- One start-frame and one video prompt per returned shot, no nine-shot padding.
- Semantic retry uses compact violation codes and stops after two retries.
- Prompt output equals skill output; no server suffix/marker/creative append.
- Image/video model catalog and snapshot are isolated from normal model memory.

## 5. API and UI

- Feature flag hides entry and direct calls fail when disabled.
- Dialog validates idea/reference/cast/duration/model fields and retains draft on errors.
- Marketplace Capture two-stage browser supports loading/empty/error/success states.
- Keyboard and accessible names/focus for dialog, upload, product cards, image selection.
- Special page hides normal story/stage controls and retains shared prompt/render controls.
- Storyboard renders 1–5 special shots and does not create normal placeholders.
- Existing normal add-episode flow remains behaviorally identical.

## 6. Observability and integration

- Events contain safe bounded IDs/versions and omit idea text/URLs/secrets.
- Credit reservation/release and idempotent replay are covered.
- Full focused matrix, typecheck/lint/build, migration check, and browser evidence are
  recorded with pass/fail/skipped boundaries.
- Five post-implementation gap-audit reports exist and every must-fix is closed.
