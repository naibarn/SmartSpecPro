# Request

## Original request

Publish the current Smart AI Hub Worker App runtime completely, including
transcription, and put an update button on Runtime & agents so a damaged
runtime can be repaired.

## Repository assumptions

- `hyperframes-wsl2@2026.08.30.1` is the current local runtime source.
- The production archive is older and does not contain Whisper assets.
- The existing install commands and managed-WSL status polling should be
  reused.
- A release must not be published without the real signing input.

## Non-goals

- Replacing the Worker App installer/update flow.
- Changing Hermes runtime behavior.
- Deploying or pushing production changes as part of local implementation.
