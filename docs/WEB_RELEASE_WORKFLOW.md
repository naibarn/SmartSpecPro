# SmartAIHub Web Build and Release

Use the same commands from the repository root or `apps/web`.

## Build an artifact without changing production

```bash
pnpm run build:canonical
```

This fetches the configured canonical ref (`origin/main`), builds its exact tip
in an isolated workspace, and records the source SHA, artifact digest, and build
result. It does not publish the artifact, restart a service, or change the
website.

## Make the latest build live on smartaihub.app

```bash
pnpm run release:web:linux
```

Equivalent compatibility commands are `npm run build:deploy` and
`pnpm run deploy:web:main`. These commands:

1. Build the latest canonical revision through the canonical builder.
2. Prepare an immutable frontend/backend artifact and verify its manifest and
   revision compatibility.
3. Ask `sudo` to authorize promotion of that exact artifact.
4. Atomically switch the versioned release for `smartspec-web.service`, restart
   that service, and run readiness checks.
5. Roll back the service pointer and restart the prior release if activation or
   readiness fails.

Only a verified promotion is reported as successful. A successful build alone
does not update the website. No database migration or SPEC-224 job is run by
this workflow.

For an exact integrated change, pass its commit SHA:

```bash
pnpm run release:web:linux -- --required-integrated-revision <sha>
```

## Verify the serving revision and login page

Check the release and backend/frontend identity reported by the status command:

```bash
pnpm run release:status
```

Confirm `release.source_revision`, `release.frontend_source_revision`,
`release.backend_source_revision`, and `backend_runtime_revision` match the
release SHA, and `target_matches_release`
is `true`. The promotion command also prints its deployment receipt and
runtime health verification.

Then open `https://smartaihub.app/login` in a private window. In DevTools,
enable **Network → Disable cache**, reload once, and confirm the login form
renders without a blank page or React console error. The HTML response must be
revalidated; hashed assets are immutable and change with the build.

Do not use a raw `systemctl restart` to publish a build. Restarting an old
working directory does not promote the new artifact. The release command
switches the versioned runtime first and restarts only `smartspec-web.service`.

## Development and browser testing

`aimarkethubs.com` is the development hostname. It connects through its own
named Cloudflare Tunnel to the development web service on `127.0.0.1:3100`.
The production tunnel and service remain independently managed.

```bash
pnpm run dev:web                         # foreground, current checkout
pnpm run dev:web:restart                 # managed background service
pnpm run dev:web:status
```

The restart command fetches canonical history and fast-forwards a clean canonical
checkout, refreshes web dependencies when the lockfile changes, then restarts
only the dev web service and checks both API readiness and the
anonymous diagnostics guard. Edited or differently branched checkouts are preserved
and identified explicitly in the launcher revision.

The development launcher reads `~/.config/smartspec-dev/web.env`, or the path
specified by `SMARTSPEC_DEV_ENV_FILE`. It requires `SMARTSPEC_ENVIRONMENT=development`,
an isolated database ending in `_dev_web` by default (or the explicit shared-production mode below), authentication and
encryption keys matching the selected data, a separate `CONTROL_PLANE_API_KEY` and `CONTROL_PLANE_URL`,
and a port other than 3000. It sets `DOTENV_CONFIG_PATH` so the
application does not load the production `.env` as a fallback. The launcher records the source SHA (with a dirty marker for edited source)
in backend diagnostics and Vite release identity. Frontend edits
use Vite HMR; restart the development service after backend edits.

Systemd user service templates and the complete `web.env.example` are in
`ops/dev-web/`. `SMARTSPEC_ALLOWED_ORIGINS` must contain the exact HTTPS dev
origin so browser login passes the existing CSRF/CORS checks. The web service's
`~/.config/smartspec-dev/process.env` sets PATH to the installed Node 22 binary.
The dedicated Redis instance listens only on loopback port 6391. The separate
Python backend listens on loopback port 8100 with `python.env`; both APIs use
the configured dev database. The Python launcher requires explicit shared-production mode for a production DB
name and disables implicit discovery of the production dotenv file. Its working directory
and media files live outside the production tree. Python readiness is checked
at `/health/ready`; detailed `/health` reports missing test LLM credentials
until a development provider is configured. The development
database has its own restricted login role, a schema-only snapshot (plus non-secret checkpoint schema-version metadata), and synthetic
test accounts; production data and provider credentials are not copied.
External providers and Google OAuth need their own test credentials; production
provider keys are not copied.

Configure the Cloudflare DNS record in the account owning `aimarkethubs.com`:
CNAME `@` to `<dev-tunnel-id>.cfargotunnel.com`, proxied, TTL Auto. The tunnel's
ingress accepts only `aimarkethubs.com` and forwards it to port 3100; other
hostnames receive 404. Use `cloudflared tunnel ingress validate` against the
dev config before starting its service. Do not use `tunnel route dns` with a
certificate scoped to a different zone: it can create a record under that zone.

Open `https://aimarkethubs.com/login` in a new private window, confirm it renders
on the first load, log in with the synthetic development Admin, and test Admin
Collect evidence. Check browser errors and compare runtime identity before
considering the public dev environment verified. DNS, tunnel connectivity, local
HTTP readiness, and authenticated browser verification are separate observations.

Run the bounded public browser acceptance against the dev hostname:

```bash
pnpm run dev:web:verify
```

It opens three fresh browser contexts, signs in through the real login form,
clicks Collect evidence, rejects anonymous/domain-admin diagnostics access,
and checks that diagnostics contain no configured secrets. Synthetic test
credentials are read from `~/.config/smartspec-dev/admin-login.txt` and
`guard-login.json`; never put them in Git. Receipts and screenshots are written
to `~/.local/share/smartspec-dev/evidence/`. If local DNS still caches an old
negative answer, the check resolves the public address through Cloudflare DoH
and records that fallback explicitly; TLS verification remains enabled.

The host must enable user lingering (`loginctl enable-linger dev`) for the
development user services to remain available after SSH logout and after boot.

## Mirror tenant website configuration into development

```bash
pnpm run dev:tenant:sync             # read-only inventory
pnpm run dev:tenant:sync -- --apply  # copy current production tenant config
pnpm run dev:web:restart
pnpm run dev:web:verify
```

The sync reads the production connection from `apps/web/.env` with a read-only
transaction and writes only to the isolated development database configured in
`~/.config/smartspec-dev/web.env`. It copies branding, theme, tenant settings,
active-system feature flags, plan limits, public pages, navigation and per-path
SEO. Tenant ID, slug, dev domain, owners, users, billing and credentials remain
separate. Retired-system feature flags remain disabled. It does not copy global
provider credentials or execute jobs/migrations.

Public tenant branding images are read from their exact source storage keys and
saved as content-addressed local files under `apps/web/client/public/dev-tenant-assets/`
(ignored by Git). Storage credentials are used only in the sync process and are
never copied into dev. Internal website URLs point to the dev hostname.

The target update is transactional, fenced against concurrent syncs, and verified
field by field before commit. Existing dev data is backed up privately before
updates; unrelated dev content is retained. A receipt and backup path are recorded
under `~/.local/share/smartspec-dev/evidence/tenant-config-sync.json`.

## Shared production data debugging

When explicitly authorized by the owner, both dev env files can use:

```dotenv
SMARTSPEC_DEV_DATABASE_MODE=shared-production
SMARTSPEC_SHARED_DATABASE_NAME=smartspec
```

Set each `DATABASE_URL` to the existing production connection (Python uses the
`postgresql+asyncpg` scheme), with matching existing auth/encryption keys kept in
the private environment files. Set `SMARTSPEC_DEV_TENANT_DOMAIN=smartaihub.app`
in `web.env`. The `APP_URL` stays `https://aimarkethubs.com`; only that debug
hostname resolves to the existing production tenant. No tenant record or DNS
change is needed. Ports, Redis, cookies, logs and runtime processes stay separate.

This mode uses live production users and data: request-driven edits affect
production immediately. Production retains ownership of schedulers, startup
recovery and background processing. Dev skips skill auto-sync, background jobs,
Python schema creation, default seeding and startup schema/config watchers.
No migrations run during the switch. The isolated database is retained for rollback.

Restart only the two dev APIs after updating their private env files, then run
`pnpm run dev:web:verify`. In shared mode this command performs public navigation
and anonymous guard checks without using synthetic credentials or mutating
production accounts. Authenticated acceptance requires an existing production
account/session. Do not run `dev:tenant:sync` in this mode: the data is already
shared, and the sync tool intentionally accepts isolated target databases only.
