# Worker App macOS Source Bundle

## Goal

Publish a downloadable source ZIP from the Dashboard so a Mac machine can
continue the Worker App macOS build preparation without copying the full dirty
server workspace or any generated runtime binaries/secrets.

## Bundle contract

- Name: `smart-ai-hub-worker-app-macos-source-<worker-version>.zip`.
- Source list comes from the current Git worktree, including tracked changes
  and non-ignored source files.
- Exclude `node_modules`, build targets, Vite/Tauri output, generated runtime
  packs, release binaries/archives, caches, logs, `.env` files, and private key
  material.
- Include the root workspace manifests, all source workspaces needed by the
  monorepo, `apps/worker-app`, and a Mac build guide.
- Do not claim that the ZIP is a ready Mac installer. The guide explicitly
  lists the native macOS runtime, Xcode/signing, and bundle configuration work
  that remains.

## Dashboard contract

Expose the bundle separately from the Windows installer:

- `GET /api/desktop-releases/worker-app/macos-source/latest`
- `GET /api/desktop-releases/worker-app/macos-source/download`

The Dashboard shows a dedicated source-bundle card. The existing Worker App
installer endpoint and auto-update logic remain unchanged.

The card explains the complete handoff flow in the UI: download and extract the
ZIP, prepare Xcode/Node/Rust on macOS, enter the extracted folder, run the
dependency/typecheck/test commands, and continue the native runtime/Tauri
packaging work from `MAC_BUILD.md`. It also explicitly labels the bundle as
source-only so users do not mistake it for a ready-to-install Mac application.

## Safety and verification

- The packager refuses to include known secret/artifact patterns and records
  the included file count and SHA-256 in the ZIP manifest.
- The ZIP is opened and checked after creation; no `.env`, private-key,
  installer, runtime-pack, or `node_modules` entries may exist.
- Run Worker App typecheck/tests and focused Dashboard tests before publishing
  the generated source bundle to both public release directories.
