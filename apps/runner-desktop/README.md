# SmartAIHub Runner desktop app

SmartAIHub Runner is a local control panel for the existing Runner engine. It is
a separate product from SmartAIHub Desktop: connecting opens the existing
browser device-approval flow, then returns to this window.

## Use

1. Install and open SmartAIHub Runner.
2. Choose **Connect through browser** and approve the device in SmartAIHub.
3. Add the folders Runner may work in, then choose a default workspace if you
   want one for tasks that do not specify a workspace ID.
4. Review detected tools and their check results. A version check does not prove
   the tool's account is signed in.
5. Start Runner to receive approved work. Stop Runner to end its control loop
   and terminate any active external-agent child process.
6. Optionally enable **Start Runner when I log in**. This is a reversible,
   per-user Windows/macOS setting. Closing the window hides it to the tray/menu
   bar; use its menu to reopen or quit.

Workspace paths and UI preferences are local. SmartAIHub receives workspace IDs
and bounded capability status, not local absolute folder paths.

## CLI

The standalone CLI remains available on Windows, macOS, and Linux. For example:

```sh
smartaihub-runner connect
smartaihub-runner workspace list
smartaihub-runner run --workspace "/path/to/project"
```

`--workspace` registers the existing directory in the local workspace registry
and uses its workspace ID as the default when an incoming task does not specify
one. Linux continues to use the CLI release workflow.

## Build and installer trust

The `SmartAIHub Runner desktop review build` GitHub Actions workflow builds a
Windows x64 NSIS installer and a macOS Universal DMG as unsigned review
artifacts. It does not publish either installer as a trusted release.
Authenticode signing and Apple Developer ID signing/notarization require OS
distribution certificates and secrets. `RUNNER_SIGNING_KEY` signs Runner update
assets only; it is not a Windows or Apple installer certificate.

For local development, install the Tauri CLI and run `cargo tauri dev` from this
directory. Native Windows/macOS installers must be validated on their matching
GitHub-hosted runners; a Linux build does not prove native installation or OS
trust behavior.
