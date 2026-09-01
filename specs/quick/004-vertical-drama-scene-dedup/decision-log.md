# Decision log

1. Use a hybrid policy: exact deterministic reuse, advisory near-match review, explicit create-new.
2. Keep existing `locationKey` authoritative; do not replace it with a fuzzy-generated key.
3. Put similarity helpers in the shared Vertical Drama location identity module so server and client can use one normalization contract.
4. Store the selected canonical key in Special Tie-in input; this is JSON data and requires no migration.
5. Defer merge/delete of rows 133/134/135/137 until an explicit asset/reference rebind operation is designed and audited.

## Self-review rounds

- Round 1: covered normal and special creation paths; no missing entry point found.
- Round 2: checked tenant/user/series ownership; selected-location API must validate ownership server-side.
- Round 3: checked false positives; near matches remain review-only and tests include distinct sub-location names.
- Round 4: checked async recovery; persisted `sceneLocationKey` is read before auto-provisioning.
- Round 5: checked migration/rollback; no DB migration or destructive cleanup is required.
