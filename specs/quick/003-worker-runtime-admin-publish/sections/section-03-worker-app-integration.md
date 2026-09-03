# Section 03 — Worker App integration

## Ownership

Own Worker App runtime status, update/repair messaging, current manifest consumption, fail-closed render status, and regression verification.

## Targets

`apps/worker-app/src/main.tsx`, runtime manifest client types if required, existing runtime tests.

## TDD

Prove manifest unavailable means render paused and status is not Ready. Prove published current artifact clears the block and Update/repair remains force-capable.

## Acceptance

The installed Worker App never claims render readiness without a verified published runtime, and the Runtime & agents repair action points to the same catalog used by the server.
