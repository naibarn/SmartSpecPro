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

Confirm `source_revision`, `frontend_source_revision`, and
`backend_source_revision` match the release SHA, and `target_matches_release`
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

`pnpm run dev:web` starts the development server from the current checkout for
local work. It does not publish to either public hostname. The repository's
Cloudflare staging Worker is a local/dry-run target (`workers_dev` only, no
custom hostname, activation disabled); it is not a public development site.

`aimarkethubs.com` currently has no A, AAAA, or CNAME answer in public DNS, and
there is no route or development-service configuration for that hostname in
this repository. Therefore a browser cannot reach it yet. A public dev site
needs a separate dev service and non-production environment, plus an approved
Cloudflare Tunnel/ingress and DNS record pointing `aimarkethubs.com` to that
dev service. It must not point at the production service or database. Until
that ingress exists, use the local URL printed by `pnpm run dev:web` for
development checks; use `smartaihub.app` only after the production release
command and the status/browser checks above.
