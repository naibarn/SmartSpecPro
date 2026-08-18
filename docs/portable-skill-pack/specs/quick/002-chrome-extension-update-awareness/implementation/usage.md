# Usage Guide

## User flow

- Open the SmartAIHub Capture side panel. The extension checks the configured SmartAIHub Dashboard release endpoint at most once every six hours per server origin.
- If a newer Dashboard ZIP exists, choose `ดาวน์โหลดอัปเดต` and install it using the existing Dashboard ZIP workflow.
- If Chrome has already delivered a managed/Web Store update, choose `รีสตาร์ตเพื่อติดตั้ง` to reload into that version.
- Choose `ไว้ภายหลัง` to hide only the displayed version. A later release will appear again.

## Release workflow

Run `npm run package:web-dashboard` from `apps/extension`. The command builds and verifies a versioned ZIP under `apps/web/client/public/releases/`. Keep prior release ZIPs for rollback.

## Verification

- `npm run test:update`
- `npm run typecheck`
- `npm run package:web-dashboard`

The update check is advisory for Dashboard ZIP installs. Automatic replacement is available only when Chrome itself supplies a native update event.
