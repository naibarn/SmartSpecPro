# SmartAIHub Hermes Connector / Remotion Executor

> Production status: local rendering is available only after the matching
> signed runtime pack is published for the host. If the manifest endpoint
> returns `runtime_pack_not_published`, MCP/OAuth is healthy but local rendering
> is not enabled yet.

The standalone executor is distributed as a signed platform pack. It does not require the
Tauri Worker App or Xcode on the user's machine.

Supported first-release targets are Windows 11 x64 and macOS arm64/x64. The
connector runs `doctor`, discovers a known Hermes installation, and installs a
matching signed runtime pack when the local browser, FFmpeg/ffprobe, fonts, or
Remotion sidecar are missing. It never accepts an arbitrary executable path or
shell command from MCP.

After `connect`, the user approves the device in SmartAIHub once. The device
identity and refresh material are stored in Windows DPAPI or macOS Keychain.
The executor then uses the Worker REST control plane for registration,
heartbeats, claims, progress, and presigned artifact upload. MCP is only the
Hermes intent/status interface; it never carries video bytes or worker tokens.

Useful commands:

```text
smartaihub-remotion-executor doctor
smartaihub-remotion-executor connect
smartaihub-remotion-executor start
smartaihub-remotion-executor status
smartaihub-remotion-executor logout
```

If the command is not found, download the matching signed runtime pack from
Settings → MCP & Connected Devices, extract it, and run the installer from the
extracted `runtime-pack/executor/packaging` directory:

```powershell
# Windows 11
powershell -ExecutionPolicy Bypass -File .\runtime-pack\executor\packaging\install.ps1
```

```bash
# macOS
bash ./runtime-pack/executor/packaging/install.sh
```

The signed release archive carries the pinned Ed25519 public key beside the
installer. A source checkout without that key refuses to install, and a
manifest/ZIP/signature mismatch is rejected before any runtime is replaced.

The connector's automatic bootstrap uses native archive support per platform:
Windows 11 uses its bundled `tar.exe` for ZIP inspection/extraction, macOS uses
`unzip` for inspection and `ditto` for extraction, and Linux fallback uses
`unzip`. The release builder itself also has a Node ZIP fallback, so a release
host does not need the `zip`/`unzip` packages installed.

If doctor reports `Blocked`, follow its single corrective action. Do not copy a
worker token, provider credential, R2 key, or local filesystem path into Hermes.
