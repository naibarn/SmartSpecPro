# Section 05: Run Persistence and Handoff

## Goal

Persist the full Production Space and route approved plans to downstream workspaces.

## Requirements

- Extend production run storage with `ProductionSpace` or compatible canvas state.
- Save:
  - brief,
  - ordered shots,
  - assets,
  - selected planning skill,
  - selected model,
  - canvas nodes/edges/layout,
  - per-node config snapshots,
  - per-node outputs,
  - product storyboard assets and `ProductClaimEvidenceMap`,
  - per-shot product evidence manifests,
  - shot child node graphs,
  - plan package,
  - verifier result,
  - approval state,
  - layer versions and downstream result records.
- Project search restores the full space.
- Handoff targets:
  - Video Shot workspace,
  - Storyboard Review,
  - Video Edit,
  - Image/Video/Audio tabs for manual node execution.
- Clicking an executable node opens the correct existing surface with that node's config snapshot preloaded.
- Clicking a `video_shot` group opens Video Shot workspace with that shot's configuration and child nodes.
- Saving from the target surface returns to the same node and updates only that node.
- Planning and verification never reserve generation credits.
- Downstream Storyboard Review / Video Edit result records import as new ProductionSpace versions and must not overwrite locked shot/node configs.

## Acceptance

- Saved project reopens with canvas and assets intact.
- Saved project reopens ordered shots, shot configs, and child node graphs intact.
- Saved project reopens every node with its own config and output refs intact.
- Approved plan exports to Storyboard Review and Video Edit.
- Manual execution node can open the appropriate media tab with prefilled context.
- Stale downstream result records produce conflict or save-as-new-version flows.
