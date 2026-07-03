# Maintenance Notes

- Safe additive changes (new optional fields, new examples) may be auto-applied.
- Breaking changes to pinned upstream field names or literal constraints require approval.
- `scripts/verify.sh` runs before finalize and must pass without provider credentials.
- This skill never calls paid image/video/TTS providers during verification.
- Imported-guide parity fields must stay snake_case in stored artifacts.
