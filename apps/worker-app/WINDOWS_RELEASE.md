# Smart AI Hub Worker App Windows release

An administrator can start the Windows Worker App build from the Desktop Host
release console. The server selects the next version above both the current
source version and the latest published Worker installer, pins the `main`
commit, and dispatches **Worker App Windows Release**. Build status is retained
and the server resumes polling after a restart.

The workflow builds on Windows x64, checks the installer is a Windows PE file,
keeps a 14-day GitHub Actions artifact with the installer and build manifest.
The server finds the matching successful workflow run, downloads its artifact
using the configured GitHub integration, and checks the artifact digest, source
commit, build/run IDs, version, filename, Windows PE header, size and SHA-256.
It then stores the installer in the Worker release catalog, where the Dashboard
download and version history remain available after the GitHub artifact expires.
The existing OIDC upload route remains available for an explicitly selected
legacy direct publish, but is not required for the admin build flow.

Before building, the workflow checks that the Worker App still has its
Dashboard runtime download and archive SHA-256 verification flow. The installer
downloads the stable WSL2 runtime when a worker is set up; the multi-gigabyte
runtime archive is not embedded in the Windows installer. Runtime publication
is managed separately from the installer release.

Configure the repository and GitHub token in Desktop Release Settings before
starting a build. If import fails, the admin console offers a retry for the
same build and the artifact remains available until its expiry. Manual GitHub
workflow runs retain their artifact, but do not create an admin build record.

This Worker App uses its own installer download/update flow. Tauri's updater
signing key is not used by this app's current `tauri.conf.json`, so it is not a
prerequisite for this workflow. Windows Authenticode signing is not configured
here; adding it requires a trusted code-signing certificate and a separate
verified signing step.
