# Maintenance Notes

- Safe additive changes (new optional ledger fields, new examples) may be auto-applied.
- Breaking changes to the pinned camelCase ledger key names (`evidenceLedger`, `characterActivationLedger`, `threatLadder`, `consequenceLedger`, `threadLedger`, `worldRuleLedger`) require approval — Section 04/06/07 of Feature 132 read these keys directly.
- `character_profiles` stays an empty, reserved array until Feature 132 §8 (F132H) explicitly extends this skill's prompt/schema to populate it — do not populate it speculatively.
- `scripts/verify.sh` runs before finalize and must pass without provider credentials.
- This skill never calls paid image/video/TTS providers during verification.
