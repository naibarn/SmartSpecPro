# Smart AI Hub Worker App Windows release

Run **Worker App Windows Release** from GitHub Actions on `main`. Leave the
version blank to use the next patch version, or enter an explicit version; the
optional release notes appear in the Dashboard catalog.

The workflow builds on Windows x64, checks the installer is a Windows PE file,
keeps a 14-day GitHub Actions artifact for recovery, then publishes it to the
Dashboard Desktop Release catalog. Publication uses GitHub Actions OIDC; no
long-lived Dashboard upload token is stored in repository secrets. The server
accepts only this repository's `workflow_dispatch` run from `main`, and checks
the release version, filename, installer signature bytes, and SHA-256 before
publishing. The workflow then confirms the Dashboard latest release has the
same version, filename, size, and SHA-256 as the build artifact.

Before building, the workflow checks the Dashboard's stable WSL2 runtime
manifest. The installer downloads that signed runtime when a worker is set up;
the multi-gigabyte runtime archive is not embedded in the Windows installer.
The release stops if the published runtime is missing, denied, or has an
unexpected platform, renderer contract, or checksum.

The server defaults the trusted repository to `naibarn/SmartSpecPro`. Set
`SMARTAIHUB_WORKER_APP_RELEASE_REPOSITORY` if the repository is renamed or the
release workflow is hosted elsewhere. Deploy the server route before running
the workflow; otherwise publication fails closed and the retained Actions
artifact remains available for recovery.

This Worker App uses its own installer download/update flow. Tauri's updater
signing key is not used by this app's current `tauri.conf.json`, so it is not a
prerequisite for this workflow. Windows Authenticode signing is not configured
here; adding it requires a trusted code-signing certificate and a separate
verified signing step.
