# ADR R1.0 — Mini App Hosting & Data Plane, independently of Core

**Status:** Owner-confirmed product policy, design draft not implemented. 2026-11-01.

## Why
New Mini Apps are independent products, not modules that gain unrestricted table creation in Core. Reusing `smartspec` for their business data would amplify DB schema drift, blast radius, migration and ownership complexity. Existing Legacy content must remain usable during gradual movement.

## Decisions
- `smartsihub.com` = confirmed public marketplace/Core production; `aimarkethubs.com` = Debian new-system development; `smartaihub.app` = Debian legacy. Domain is presentation, never ownership or database permission.
- `smartspec` only Core canonical users/tenant/credits/jobs/registry/rights and **explicit legacy-origin data exception**. Registry/commerce **metadata about** a new app can be in Core, but new app business records cannot.
- New stateful App = separate App data DB, preferably dedicated D1 when Worker-native and small; Core and Mini Apps never share physical/logical app business database. User BYOC Cloudflare D1, managed App PostgreSQL separate from Core, BYODB PostgreSQL or own server are supported. Stateless app uses none.
- Hosting choices independent from database: marketplace root route/launch URL, verified custom domain, customer CF account, own server.
- No separate payment/user/job ledger. Apps use scoped Core APIs. App-local business db is not a platform wallet or identity.
- Owner controls repo/data and may move platform managed -> BYOC -> selfhost; data dialect translation, explicit migration, migration evidence and rollback required.

## Deployment matrix
| Hosting | Domain | Infra/compute account | App data database | Core identity/payments |
|---|---|---|---|---|
| Managed platform | `smartsihub.com` launcher/isolated runtime host | Platform Mini App pool | Dedicated D1 per App | Signed Core HTTPS API |
| Managed custom domain | Verified customer domain | Platform App pool | Dedicated D1 or separate managed PG | Signed Core HTTPS API |
| BYOC Cloudflare | Owner domain | Owner CF account | Owner D1 | Signed Core HTTPS API |
| Managed PostgreSQL upgrade | Main/custom domain | Platform/owner compute | Dedicated PG logical DB in separate App cluster/account | Signed Core HTTPS API |
| BYODB | Main/custom/BYOC | Platform or owner compute | Owner PG | Signed Core HTTPS API |
| Owner self-host | Owner domain/server | Owner VPS/on-prem | Owner supported DB, independent from Core | Optional scoped Core API while using platform commerce |
| New stateless App | Any authorized hosting | Hosting choice | NONE | Core API if registered/commercial |
| Legacy migration exception | Existing/modernized App domain | Legacy/selected Worker | Existing specifically inventoried tables in `smartspec` | Existing Core authorities |

## Non-goals
No new universal database/ORM, no forced self-hosting central API dependency when App has independently licensed offline/non-commercial operation, no destructive legacy migration, no duplicate Core billing service or extra serial approval ladder.

## Known runtime considerations
- D1 has SQLite SQL semantics; D1 and PostgreSQL migration requires semantic conversion rather than changing connection string.
- Cloudflare Worker/D1 resources are account-scoped in deployment; don't assume cross-account D1 service bindings. BYOC calls Core via scoped authenticated network APIs.
- Verified custom domain rules must respect owner zone/DNS and SSL authority; a marketplace alias doesn't create DNS rights.
- Legacy exception registry must be exact app+table+scope list, not blanket “legacy Apps can add new tables”.
