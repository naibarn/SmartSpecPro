# Vertical Drama continuity gate

## Problem

An episode can introduce a recognizable clue or an anonymous witness and then
continue generating media without a durable, machine-checkable record of the
thread. The active breakdown may contain the clue while the script generator
reads the legacy breakdown or an empty event store, so the issue is not visible
until a viewer reaches a later episode.

## Contract

- `episode_memory.threads_opened[]` is the canonical thread registration.
- Every new thread declares `expected_resolution` (`this_episode`,
  `future_episode`, or `season`) and may declare `expected_resolution_episode`.
- A later episode resolves a thread only by its stable `thread_id`.
- A thread may remain open during an incomplete horizon; it may not silently
  remain open when a complete season reaches its boundary unless it is
  explicitly marked `season`.

## Runtime behavior

1. Full-season deep drafting runs a deterministic audit before its new bible
   version is persisted. A failing audit leaves the active bible untouched.
2. Real storyboard and downstream media stages run the same audit before any
   provider work. A failure creates a repairable run and does not overwrite the
   existing script/storyboard.
3. Legacy scripts and existing episodes remain readable. Non-final legacy
   stages are grandfathered; final-stage media still fails closed if the stored
   season state contains an unresolved thread.
4. Script generation receives the active breakdown's planned cliffhanger and
   ledger context, so the authoring prompt and the validator use the same plan.

## Safety boundary

This is an additive JSON contract. No migration or backfill is performed by
the gate, and no existing episode is rewritten. The current series can be
audited separately and repaired through a new author-approved episode plan.
