# Section 01: Secure Pairing and Host Worker

## Ownership

- `apps/web/scripts/pair-hermes-worker.ts`
- `apps/web/scripts/__tests__/pair-hermes-worker.test.ts`
- host `/var/lib/smartspec-hermes-worker`
- host `/etc/smartspec/hermes-worker.env`
- `docker/systemd/smartspec-hermes-worker.service`

## TDD

Add a secure operator mode that writes the worker ID/refresh token to an
explicit environment file and suppresses secret printing. Preserve the current
interactive output mode for manual use.

## Acceptance

- CLI doctor passes version `0.18.2`.
- Pairing token never appears in captured command output.
- Environment file is root-owned `0600`.
- Unit is active and heartbeating with advertised Hermes media capability.
