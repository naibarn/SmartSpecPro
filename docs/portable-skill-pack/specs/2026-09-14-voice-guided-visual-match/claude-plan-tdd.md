# TDD Plan: Voice-Guided Visual Match Preview

## Pure matching module

- Maps source segments through trim, speed, and timeline offsets with deterministic rounding.
- Concatenates multiple voice clips without overlap or timestamp regression.
- Normalizes Thai/English punctuation, case, and whitespace without losing original display text.
- Scores caption/keyword/action/setting/object/OCR overlap and emits bounded explainable reasons.
- Keeps original order when analysis is absent or confidence is below the floor.
- Allows reorder only when every moved asset is high confidence and global score improvement exceeds margin.
- Allocates contiguous image windows covering voice duration, honoring min/max duration and deterministic gap policy.
- Produces stable proposal fingerprints and rejects stale apply revisions.
- Apply projection changes only image clips; voice and subtitle clips remain deeply equal.

## Server adapter

- Rejects wrong worker, missing scope, malformed data URL, unsupported MIME, and oversized input.
- Derives tenant/user from worker auth and does not trust body ownership fields.
- Returns strict structured analysis and redacts provider errors.
- Repeated fingerprint requests converge on the same safe analysis/cache result.
- No raw local path or signed credential appears in logs or response.

## Worker command

- Uses device-proof-signed request and connected worker token.
- Returns structured errors for unavailable server/skill and does not downgrade silently to an unregistered local command.
- Enforces image byte and MIME limits before HTTP.

## React flow

- Shows progress and error states; prevents duplicate analyze/apply clicks.
- Renders original-order fallback warning and disables reorder apply below confidence threshold.
- Apply preserves voice/subtitles and stores an undo snapshot.
- Cancel leaves the project unchanged; undo restores byte-equivalent prior JSON.
- Keyboard/focus and viewport acceptance tests cover the modal contract where browser tooling is available.

## Release proof

- `npm --workspace apps/worker-app run typecheck`
- focused Vitest command for the pure module
- focused web route tests
- `npm --workspace apps/worker-app run test`
- Worker App release/build command and artifact checksum
