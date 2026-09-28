# Section 05: Production Verification

## Ownership

- tests/build commands
- systemd/DB/HTTP evidence
- operational notes

## Acceptance

- Targeted tests and type checks pass.
- Web and worker services are active.
- `/healthz` returns OK.
- Shared worker heartbeat remains fresh.
- Server availability reports all intended scopes.
- Device-code initiation is proven without exposing the code in logs.
- Public runtime/installer endpoints return correct headers and sizes.
- No secret-leak regression is detected.
