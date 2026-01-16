# OpenWork Analysis Notes

## Overview
- **Repository:** https://github.com/different-ai/openwork
- **Description:** Open-source alternative to Claude Cowork, powered by OpenCode
- **Tech Stack:** TypeScript (84%), JavaScript (8.4%), Rust (7.1%) - Tauri-based desktop app
- **Latest Version:** v0.1.5

## Key Features (v0.1)
1. **Host mode:** Start opencode serve locally in a chosen folder
2. **Client mode:** Connect to an existing OpenCode server by URL
3. **Sessions:** Create/select sessions and send prompts
4. **Live streaming:** SSE /event subscription for realtime updates
5. **Execution plan:** Render OpenCode todos as a timeline
6. **Permissions:** Surface permission requests and reply (allow once/always/deny)
7. **Templates:** Save and re-run common workflows (stored locally)
8. **Skills manager:** List, install, import skills

## Architecture
- In Host mode, spawns: `opencode serve --hostname 127.0.0.1 --port <free-port>`
- Uses `@opencode-ai/sdk/v2/client` to:
  - Connect to server
  - List/create sessions
  - Send prompts
  - Subscribe to SSE events
  - Read todos and permission requests

## Integration Points for SmartSpecPro
1. **Client mode** - Can connect to external OpenCode server by URL
2. **Session management** - Create/select sessions
3. **SSE events** - Real-time updates
4. **Workspace path** - Uses folder picker (Tauri dialog plugin)

## Key Files to Study
- `src-tauri/` - Tauri backend (Rust)
- `src/` - Frontend (TypeScript/React)
- `design-prd.md` - Product requirements
- `prd-workspaces-jit.md` - Workspace management
