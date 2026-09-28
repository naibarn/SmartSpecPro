# Vertical Drama continuity timeline guard

## Problem

The real storyboard gate for episode 5 reads every persisted episode-memory
record in the series. Resolutions from future episodes can therefore block the
episode currently being generated when their thread openings are not present in
the past timeline.

## Design

The gate will build its timeline from persisted memories with an episode number
strictly earlier than the current episode, then append the current episode's
parsed script memory. Future planned/generated memories remain available for
their own episode checks but cannot affect an earlier episode.

The season-boundary check remains unchanged: when the current episode is the
configured final episode, unresolved non-season threads in the past plus current
timeline still fail closed.

## Verification

Add a pure regression test proving future memories are excluded while prior
memories remain included. Run the focused continuity test and the changed-file
TypeScript diagnostics.
