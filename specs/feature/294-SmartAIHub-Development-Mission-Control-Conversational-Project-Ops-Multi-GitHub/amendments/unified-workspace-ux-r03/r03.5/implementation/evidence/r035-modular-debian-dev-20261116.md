# R03.5 Modular DEV Migration and Deployment Evidence

## Source and target

- Target: `modular-debian-dev` / `https://aimarkethubs.com` (Debian with local Workerd); no production or legacy `smartaihub.app` deployment.
- Platform source: `0d2356dafa4e61b8f15777b0dc9758cc86d5fc78`, integrated at `origin/main`.
- SmartSpecPro source used for migration and handoff: `ee1e4fbfdd28c1b3cf363c09fce46772f4857312`, integrated at `origin/main`.
- Release artifact: `/home/dev/modular-development-releases/modular-debian-dev-0d2356dafa4e61b8f15777b0dc9758cc86d5fc78-r035-built`.

## Migration

- Verified database identity: `smartspec`, PostgreSQL `15.17`; pre-migration ledger had exact 0439, 0440 and 0441 source hashes.
- Migration: `0442_runner_harness_instances.sql`; source SHA-256 `d4405de7352115d1d580edc5e6cfb0762e74e8c65470e85aa01286975a97277a`.
- Registered runner: `pnpm --dir apps/web db:migrate`; result successful; ledger timestamp `1794770000003` has the exact migration hash.
- Backup: `/home/dev/.config/smartspec-dev/backups/spec312-r035-pre-0442-20261116.dump`, mode `0600`, 478,839,832 bytes, SHA-256 `e5f4c322f3784373011e46fd0ceed443ef84fbcd955faae5be6c07b35c6c42a1`; `pg_restore --list` succeeded.
- Existing owner function role lacked schema `CREATE`, as expected after R1.24 cleanup. A temporary grant was made only for the migration runner and revoked in its `finally` path. Readback: owner schema CREATE `false`; projection owner `modular_chat_mission_owner`; SECURITY DEFINER true; fixed `search_path=pg_catalog, public`; `modular_core_auth_dev` EXECUTE true; PUBLIC EXECUTE false; no broad owner SELECT on `worker_jobs` and no runtime direct SELECT on it.

## Build, deploy and runtime

- Immutable Core/Shell/Chat release build passed after fixing the registered build script to build `@smartaihub/saas-contracts` before Core.
- Release controller result: `DEPLOYED_AND_VERIFIED`, deployed at `2026-11-16T06:49:24Z`; rollback source is the prior `smartspec-dev-web.service:3100` plus the saved tunnel/systemd configuration in the release artifact.
- Controller local smoke: Core 200, Chat 200, Shell 200, Chat session without cookie 401, Chat module manifest 200, Chat entry 200.
- Controller public smoke: shell root 200, shell login 200, Chat health 200, Chat session without cookie 401, module manifest 200.
- Independent public health readback: `https://aimarkethubs.com/livez` 200, `/api/chat/livez` 200, `/login` 200; unauthenticated `GET /v1/core/chat/harnesses` returns 401.
- `runner_harness_instances` currently has zero rows. `smartaihub-runner.service` is the legacy `smartaihub.app` Runner and is not a Modular DEV Harness. Genuine registration, Job binding, Mission link, Task Control UAT and authenticated owner UAT remain pending; no fixture data was inserted to imply otherwise.

## Build correction

The initial immutable build failed because Core imports `@smartaihub/saas-contracts` but the release script did not build its `dist` output. The script now builds that workspace package before Core and includes it in manifest build commands. The corrected artifact completed all three component builds and the registered controller verified deployment.
