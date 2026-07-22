# Decision Log

- Depth: standard quick plan, three implementation sections.
- Reuse the existing OAuth tab rather than add a new top-level admin route.
- Extract Meta UI into a focused component to avoid growing AdminSettings with
  another large inline form.
- Store OAuth fields under `oauth`; store webhook verify token under
  `meta_channels`; synchronize App Secret into both categories for compatibility.
- Use the shared decrypting Python loader for all database-backed Meta secrets.
- Add Meta to Redis synchronization rather than creating another flag service.
- Use the existing global `LocaleToggle`; no second locale state is introduced.

## Stabilization Reviews

1. Coverage review: added webhook, rollout, App Review, and final-connect steps.
2. Security review: required masked secret reads and keep-existing semantics.
3. Consistency review: unified App Secret across OAuth and webhook validation.
4. Failure review: added actionable readiness and test error requirements.
5. Implementation review: confirmed no schema migration or new dependency is
   necessary. Two consecutive reviews produced no further material fixes.
