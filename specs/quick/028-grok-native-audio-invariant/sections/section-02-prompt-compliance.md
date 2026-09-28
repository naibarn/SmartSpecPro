# Section 02 — Native Dialogue Compliance

## Ownership

Video motion prompt generation, prompt QC, final formatter/persistence checks,
and focused service/router tests.

## TDD

Cover single/multi-speaker, omission retry, failed retry deterministic append,
Thai quote normalization, protected QC, overflow, and non-native separate TTS.

## Implementation

- Share the native compliance helper between generation paths.
- Append only missing lines after a failed corrective retry.
- Extend QC with protected fragments and final validation.
- Ensure final provider/persistence transforms cannot remove protected dialogue.

## Acceptance

No native-audio prompt can persist or submit without every final dialogue line;
non-native routing remains byte-compatible.

## Implementation evidence

- Single-speaker and speaker-switch paths enforce deterministic verbatim checks.
- Failed compliance retry falls back to exact-line append.
- Prompt QC protects mandatory fragments and throws explicit overflow errors.
- Provider-ready validation runs after formatter and preset transforms.
