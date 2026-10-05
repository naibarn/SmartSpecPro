# Human asset withdrawal runbook

The package currently uses no human imagery. If a registered human asset must be withdrawn:

1. Disable the asset at its public content source and remove every route reference.
2. Replace with an approved repo-owned non-human illustration or text fallback.
3. Purge CDN/application caches using the current public asset invalidation procedure.
4. Verify the asset URL and every public route no longer render it.
5. Preserve the withdrawal reason, approver, timestamps, cache evidence, and affected build SHA in the public post-launch log.

The release owner must identify the actual rights owner and response contact for each asset before publication. This repository does not claim that an unverified stock or generated asset has been rights-cleared.
