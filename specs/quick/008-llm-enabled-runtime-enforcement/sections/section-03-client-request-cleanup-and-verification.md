## Goal

Remove remaining client request payload fallbacks that can reintroduce hidden model IDs and verify the end-to-end behavior.

## Scope

- chat/agency client payload fallbacks
- targeted test and typecheck run

## Done When

- clients send enabled/default model IDs only, or omit the model cleanly when no enabled model exists
