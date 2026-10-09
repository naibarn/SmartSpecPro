---
slug: runner-connection
title: Install and connect SmartAIHub Runner
description: Install Runner on Windows, macOS, Linux, and WSL2, approve it, and troubleshoot pairing
icon: Terminal
section: features
order: 67
pages: ["/dashboard", "/runners/connect"]
tags:
  - "runner"
  - "smartaihub runner"
  - "runner install"
  - "runner connect"
  - "windows"
  - "macos"
  - "linux"
  - "wsl2"
  - "help"
  - "help/en"
aliases:
  - "runner-connection"
  - "Runner installation guide"
---

# Install and connect SmartAIHub Runner

SmartAIHub Runner runs on your computer so SmartAIHub can access supported local tools and capabilities. **Installing Runner does not install Codex, Claude, Hermes, or Antigravity.** Install and sign in to the Harnesses you need first. Runner can then discover supported tools and report their status to the Dashboard.

## Choose a package

1. Open the Dashboard and go to **Runner downloads and updates**.
2. Download the CLI package for your operating system and architecture.
3. Runner Desktop files marked **test build** are unsigned review builds for testing, not the regular CLI package.
4. Open PowerShell or a Terminal in the extracted package folder.

## Windows

1. Download the Windows x64 CLI package and extract it to a folder writable by your user account.
2. Open PowerShell in the folder containing `smartaihub-runner.exe`.
3. Start pairing:

```powershell
.\smartaihub-runner.exe connect
```

4. Open the URL printed by Runner, sign in to the SmartAIHub account you want to use, verify the device name, and select **Allow this Runner**.
5. After the Terminal confirms the connection, check status and start Runner:

```powershell
.\smartaihub-runner.exe status
.\smartaihub-runner.exe run
```

Keep the Terminal open while using Runner. Closing it stops the process.

## macOS

1. Download the CLI package for your Mac: **macOS arm64** for Apple Silicon or **macOS x64** for Intel.
2. In Terminal, extract the downloaded package (replace `<package-file>` with its actual name):

```bash
tar -xzf <package-file>.tar.gz
chmod +x smartaihub-runner-macos-<architecture>-<version>
./smartaihub-runner-macos-<architecture>-<version> connect
```

3. Open the URL in a browser, sign in to the account you want to use, verify the device name, and select **Allow this Runner**.
4. Check status and start Runner with the same extracted file name:

```bash
./smartaihub-runner-macos-<architecture>-<version> status
./smartaihub-runner-macos-<architecture>-<version> run
```

Keep Terminal open while Runner is in use. If macOS warns about software downloaded from the internet, verify the download source and your organization’s signing policy before allowing it.

## Linux x86_64 and Debian

The Linux package includes an installer for the binary and a systemd user service. Run it as your regular user; do not use `sudo`:

```bash
tar -xzf smartaihub-runner-linux-x86_64-<version>.tar.gz
cd smartaihub-runner-linux-x86_64-<version>
./install-linux-runner.sh install
~/.local/bin/smartaihub-runner connect
```

Open the URL in a browser, sign in to the intended account, verify the device name, and select **Allow this Runner**. Then start the service:

```bash
systemctl --user enable --now smartaihub-runner.service
systemctl --user status smartaihub-runner.service --no-pager
```

View recent logs with:

```bash
journalctl --user -u smartaihub-runner.service -n 50 --no-pager
```

The installer operates in the current user account, stores Runner data in that user’s home directory, and does not enable systemd lingering automatically.

If systemd or `systemctl --user` is unavailable, install the binary for your user and keep it running in a Terminal instead:

```bash
install -Dm755 smartaihub-runner "$HOME/.local/bin/smartaihub-runner"
~/.local/bin/smartaihub-runner connect
~/.local/bin/smartaihub-runner run
```

## WSL2 on Windows

WSL2 uses the Linux package and is a separate Runner from the Windows installation:

1. Open a Terminal inside WSL2 and install the Linux x86_64 package using the Linux steps above. Do not run the Windows `.exe` from WSL2.
2. Run `~/.local/bin/smartaihub-runner connect` and open the approval URL in a Windows browser.
3. Return to the WSL2 Terminal, wait for pairing to finish, and start the service using the Linux steps.

If Runner reports `RUNNER_BROWSER_OPEN_FAILED`, copy the full URL printed in the Terminal and paste it into a Windows browser. Do not reuse an old URL or an expired code.

If you install another Runner on a separate machine or account, set unique `SAH_RUNNER_ID`, `SAH_RUNNER_DEVICE_ID`, and `SAH_RUNNER_DATA_ROOT` values to keep identities and local data separate.

## Approval and accounts

- Select **Allow this Runner** only when the Runner and device names match the computer you are configuring.
- An approved Runner belongs to the account that was signed in. If you see `Runner is owned by another user`, sign in as the existing owner or create a new Runner ID for the separate machine/account.
- A successful approval confirms pairing. Runner must keep running (via `run` or its service) to appear Online.
- Updating the binary normally does not require pairing again if the existing enrollment data root is preserved.

## Troubleshooting

| Symptom | What to check |
|---|---|
| `RUNNER_BROWSER_OPEN_FAILED` | Copy the latest URL from the Terminal and open it manually. |
| `RUNNER_REQUEST_INVALID` or expired code | Start `connect` again and use the newest URL/code. Confirm the URL belongs to the Runner you are pairing. |
| `Runner is owned by another user` | Sign in as the existing owner or use a new Runner ID, device ID, and data root. |
| Dashboard shows Offline after approval | Check that `run` or the systemd service is still active, then inspect Runner logs. |
| Linux reports that `systemctl` is unavailable | Use the manual user-binary installation above, then keep `run` open in a Terminal. |

Do not post access tokens, private keys, credential bundles, or an unexpired pairing URL in tickets or public channels.

## Update or uninstall on Linux

Download a newer Linux package and run this from its extracted folder:

```bash
./install-linux-runner.sh upgrade
```

To remove only the installed binary and service, run:

```bash
./install-linux-runner.sh uninstall
```

The installer preserves enrollment and workspace data.
