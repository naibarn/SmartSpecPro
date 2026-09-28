# Usage guide

## MCP client setup

Use the canonical endpoint:

```text
https://smartaihub.app/v1/mcp
```

Preferred flow: add the endpoint in Hermes One, Hermes CLI, Claude, or Codex
and choose OAuth. The client opens SmartAIHub login/consent; no token is copied
into chat or configuration.

For a machine without a browser, open SmartAIHub in another trusted browser and
complete the device flow if the client supports it. Otherwise create
`Settings -> API Keys -> Create MCP CLI Key`, choose only the scopes required,
and store the one-time key in the operating system secret store or the client
environment. Never put it in shell history, chat, or a source file.

## ComfyUI Worker App

1. Install ComfyUI, its required checkpoint/models, custom nodes, GPU driver,
   and FFmpeg on the worker machine using the platform-specific vendor setup.
2. Start ComfyUI on loopback, normally `http://127.0.0.1:8188`.
3. In Worker App -> Settings, enable `Detect and accept ComfyUI jobs` and keep
   the local service URL set to the loopback address.
4. Connect the Worker App to SmartAIHub and pass its normal runtime doctor.
5. Submit a supported Comfy image/workflow job from the web or MCP. The worker
   claims only when the local service is reachable, uploads each bounded image
   or video artifact through the existing worker credential flow, and publishes
   the result to the server/media history.

The Worker App does not download arbitrary models or execute a remote ComfyUI
URL. A missing model/custom node/GPU is a machine readiness problem and must be
shown as a remediation state before attempting production work.

## Verification commands

```text
npm --workspace @smartspec/worker-app run typecheck
cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml
JWT_SECRET=test-secret npm --workspace apps/web test -- --run \
  client/src/lib/__tests__/mcpClientOnboarding.test.ts \
  server/_core/__tests__/mcpResources.test.ts \
  server/services/__tests__/workerSchedulerService.test.ts \
  shared/__tests__/workerRuntime.test.ts
```

The commands prove local contracts only. They do not replace live OAuth,
third-party client, GPU/model, signed release, or production upload evidence.
