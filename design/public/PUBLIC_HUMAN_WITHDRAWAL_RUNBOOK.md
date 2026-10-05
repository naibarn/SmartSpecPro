# Human asset withdrawal runbook

The current repository-owned public Home implementation uses the registered generated editorial asset `public-home-human-editorial`. If this or a future human asset must be withdrawn:

1. Disable the asset at its public content source and remove every route and `srcset` reference.
2. Replace with an approved repo-owned non-human illustration or text fallback.
3. Purge CDN/application caches using the current public asset invalidation procedure.
4. Purge/expire all responsive derivatives (480/768/1020/1536px), verify no derivative URL or route renders it, and confirm no social/OG derivative remains.
5. Preserve the withdrawal reason, approver, timestamps, cache evidence, and affected build SHA in the public post-launch log.

The release owner must identify the actual rights owner and response contact for each asset before publication. This repository does not claim that an unverified stock or generated asset has been rights-cleared.
