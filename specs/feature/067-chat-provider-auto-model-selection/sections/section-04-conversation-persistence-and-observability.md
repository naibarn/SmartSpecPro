# Section 04: Conversation Persistence and Observability

## Purpose

Persist user intent separately from runtime resolution and make auto behavior explainable.

## Ownership

- conversation preference model
- resolved-model metadata
- continuity behavior
- user/operator visibility

## Target files

- conversation persistence or metadata files
- chat UI display hooks
- audit/logging touchpoints

## Implementation notes

### Persist preference separately from resolution

Store:

- selection mode
- explicit model if applicable
- pinned provider if applicable

Also store:

- last resolved model
- last resolved provider
- last resolved route family

### Continuity rule

If multiple candidates satisfy the run:

- prefer candidates compatible with the last resolved family
- switch family only when requirements force it or no compatible candidate remains

### Observability rule

Expose enough metadata for:

- UI transparency
- audit/debugging

## Acceptance checks

- provider-auto conversations remain provider-auto across runs
- explicit conversations remain explicit
- last resolved model/provider are inspectable without overwriting the user’s stored preference
