# SmartAIHub Hermes Connector / Remotion Executor

The standalone executor is a Node workspace package. It does not require the
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
npm --workspace @smartspec/remotion-executor run doctor
npm --workspace @smartspec/remotion-executor run connect
npm --workspace @smartspec/remotion-executor run start
```

If doctor reports `Blocked`, follow its single corrective action. Do not copy a
worker token, provider credential, R2 key, or local filesystem path into Hermes.
