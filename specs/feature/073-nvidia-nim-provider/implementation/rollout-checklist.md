# NVIDIA NIM Rollout Checklist

This checklist captures the phase 1 verification gates that now exist in code and tests.

## Sync-only stage

- Verify the `nvidia_nim` provider syncs against `GET /v1/models`
- Verify synced NVIDIA and partner rows appear in the admin catalog
- Verify newly synced rows remain `isEnabled = false` until an admin enables them

## Manual chat enablement stage

- Verify reviewed NVIDIA chat rows with `catalogEligibility = public-chat` can be enabled manually
- Verify embedding, guardrail, parse, and other deferred rows are rejected at the mutation boundary
- Verify invalid or stale NVIDIA mappings render with `catalogEligibility = invalid`

## Auto-selection stage

- Verify only `public-chat` NVIDIA rows participate in provider-auto and global-auto
- Verify `manual-only` rows remain available only through explicit selection
- Verify invalid NVIDIA rows stay suppressed from enabled runtime loaders and capability-based policies

## Explicit embeddings stage

- Verify internal embeddings can call NVIDIA only when `provider = nvidia` or `provider = nvidia_nim`
- Verify `NVIDIA_NIM_API_KEY` is required for explicit NVIDIA embedding calls
- Verify the default retrieval embedding path still uses the existing `text-embedding-3-small` flow

## Deferred scope checks

- Verify rerank remains deferred
- Verify no implicit retrieval fallback to NVIDIA embeddings has been introduced
- Verify partner rows without reviewed rollout metadata remain non-public by default
