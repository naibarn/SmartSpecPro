<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run <focused files>
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-dialogue-audio-contracts
section-02-audio-qc-editing-and-assembly
section-03-cross-episode-continuity
END_MANIFEST -->

# P3 Sections — Audio, Editing and Cross-Episode Continuity

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-dialogue-audio-contracts | P0–P2 | 02, 03 | No |
| section-02-audio-qc-editing-and-assembly | 01 | 03 | No |
| section-03-cross-episode-continuity | 01, 02 | P4 | No |

## Execution Order

Run sequentially because sound intent, versioned assets, assembly and memory share episode lineage.

## Section Summaries

### section-01-dialogue-audio-contracts
Reconcile dialogue, voice, lip-sync and native-audio modes against existing user settings.

### section-02-audio-qc-editing-and-assembly
Complete only needed audio QC/repair/mix/edit steps and preserve video on optional failure.

### section-03-cross-episode-continuity
Use current series memory and versioned visual/audio facts without making prior context a render prerequisite.
