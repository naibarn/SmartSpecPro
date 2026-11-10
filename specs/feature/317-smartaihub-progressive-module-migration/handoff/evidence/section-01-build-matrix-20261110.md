# Section 01 — Independent package build matrix

- Source: `smartaihub-platform@6c1b97a65f860ba5d9dadb06e188fa53316efbdb`
- Profile: `package`; local verification on 2026-11-10; 23 GiB RAM available.
- Root `package.json` has no unqualified `build` command. Named builds select Core, Shell, Chat, Browser Pilot, or contracts.

| Build command | Turbo/package scope | Result and measured output |
|---|---|---|
| `pnpm run build:core` | `@smartaihub/saas-core` | PASS; Wrangler dry-run 388.64 KiB / 91.87 KiB gzip |
| `pnpm run build:shell` | `@smartaihub/saas-shell` + `@smartaihub/saas-contracts` | PASS; Shell entry JS 229.29 kB / 72.00 kB gzip; CSS 209.53 kB / 37.38 kB gzip; Chat route remains a separate lazy asset |
| `pnpm run build:chat` | `@smartaihub/chat` + `@smartaihub/saas-contracts` | PASS; Chat JS 222.40 kB / 69.24 kB gzip; CSS 3.14 kB / 0.91 kB gzip; Wrangler dry-run 56.20 KiB / 13.59 KiB gzip |
| `pnpm run build:browser-pilot` | `@smartaihub/browser-pilot` + `@smartaihub/saas-contracts` | PASS; policy package output JS 2,706 bytes and declarations 1,803 bytes |

Each command built only the selected workload and its small direct contracts dependency. No command built the full workspace, Legacy `apps/web`, or an unrelated module. All Wrangler invocations were dry-runs; this is package/build evidence, not deployment evidence.
