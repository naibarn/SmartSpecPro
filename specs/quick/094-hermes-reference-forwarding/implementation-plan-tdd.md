# TDD plan

Red:
- A prefixed `storageKey` lookup must resolve the media asset.
- Required batch resolution must reject any dropped reference.
- Vertical Drama Hermes routing must not queue a job with an empty reference
  array when references were expected.
- A stale cached checksum must fail the new assertion until the builder hashes
  the current object bytes and repairs the cache.

Green:
- Add the minimum lookup variants and required-mode guard.
- Thread required mode only through paid Vertical Drama image paths.
- Always use the freshly hashed object checksum in Hermes contracts and update
  the cache only when it differs.

Regression:
- Existing optional-drop behavior.
- Tenant/user ownership.
- Hermes image routing and scheduler suites.
- Matching-checksum no-write behavior and best-effort cache write failure.
