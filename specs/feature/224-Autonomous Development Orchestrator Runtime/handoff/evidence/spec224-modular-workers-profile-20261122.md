# SPEC-224 Modular Workers production profile · 2026-11-22

SPEC-224 §262.1 and the corresponding SPEC-312 owner decision make Cloudflare Containers an optional placement for the Modular product. The Hono control plane uses Worker APIs and the shared PostgreSQL Job authority. Machine execution goes to an approved Runner with an environment-specific enrollment. The first implementation work remains conversation binding and Goal preparation on Hono, followed by canonical Job dispatch and receipts. The host-side source-authority code continues to run outside Workerd.

## Focused baseline verification

Platform source `4600db10d8be7949b72e358597f463ba3a0845cd`, 2026-11-22, package profile. Wrangler 4.159.0 used the repository's local DEV configuration. The smoke run used a disposable persistence directory and no live database credentials.

| Check | Observed result |
| --- | --- |
| `pnpm build:core` | Wrangler dry-run passed. Bundle 606.05 KiB, 136.38 KiB gzip. The reported bindings were Durable Objects, Queue, R2 and environment settings. |
| `pnpm build:chat` | Independent Vite build and Wrangler dry-run passed. Worker bundle 67.25 KiB, 15.25 KiB gzip. The main browser chunk emitted Vite's existing 500 kB warning. |
| `pnpm build:shell` | Independent build and Wrangler dry-run passed. The static Shell reported zero Worker bindings. |
| Disposable `wrangler dev --local` | Workerd booted Core with no Container configuration. `GET /livez` returned `200` with `service=smartaihub-core`. |
| Focused Core tests | 41 passed across `environment.test.ts`, `runnerRoutes.test.ts` and `chatQueueRuntime.test.ts`, including the production Hyperdrive connection-policy tests using fixture bindings. |

These checks cover the existing DEV Worker bundles and runtime startup. Full Modular Goal execution, production-equivalent Hyperdrive/Queue/receipt smoke, and production deployment remain pending. The detailed DEV Runner baseline is in the [prior checkpoint](spec224-modular-dev-runner-source-20261121.md).

Platform references [Workers Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/), [Hyperdrive with pg](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/), [Queue delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).
