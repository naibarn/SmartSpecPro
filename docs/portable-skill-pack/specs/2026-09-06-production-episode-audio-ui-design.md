# Production Episode Audio Lane

## Decision

Feature 176/177 controls are surfaced in the Production tab, inside every Production Episode card. A Production Episode is a group of subepisodes, so the UI and orchestration must use the group identity and compiled production artifact rather than silently using the first member episode.

## Card sections

1. Video / compile status
2. Sound & Music Score
   - วิเคราะห์อารมณ์และวางแผนเพลง
   - Approved Plan / rights state
   - Worker queue state
   - published music takes
   - score mix / QC state
3. Captions
4. Export

## Data contract

The production episode manifest carries stable member episode IDs. Existing per-subepisode Feature 176/177 records remain backward compatible; the Production card aggregates those persisted member states and is never inferred from a first member episode. A future group-native mix can extend this contract without changing the current per-subepisode records.

## Failure behavior

Missing compiled output, missing active Worker binding, rights rejection, stale artifact revision, or unavailable MiniMax Music 3 must be shown as a truthful blocked/failed state. No mock, stock, alternate-model, or fabricated QC result is allowed.

## Acceptance

- The control is discoverable at `/drama-series/:id?tab=production`.
- Every Production Episode card has an independent audio lane.
- The lane lists every member Sub-Episode and exposes its real analysis, plan, rights, Worker, takes, and mix state.
- Queue/status/takes/mix state is sourced from persisted backend state.
- Archived series keep the lane readable but mutation actions disabled.
- Existing Production Episode video behavior and existing subepisode audio flow remain intact.
- Focused UI/server tests and diff checks pass without running `npm run check`.
