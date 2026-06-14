# Google Flow Drag-Drop Extension Checklist

This checklist verifies SmartAIHub Marketplace Capture image drag-drop into Google Labs Flow.

## Build

```bash
nvm use
npm run package:web-dashboard --workspace @smartspec/marketplace-extension
```

Expected output:

- `apps/web/client/public/releases/smartaihub-marketplace-capture-extension-0.1.77.zip` exists.
- `verify:dashboard-package` prints `Verified ...smartaihub-marketplace-capture-extension-0.1.77.zip`.

## Install Locally

1. Open Chrome `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select `apps/extension/dist`.
5. Reload any open `labs.google` / `flow.google` tabs.

## Manual Flow Test

1. Open a Google Labs Flow project.
2. Open the SmartAIHub extension side panel.
3. Hover or press the desired generated image until it shows `file ready`.
4. Drag the image into the Flow drop target.
5. Confirm the image is accepted as a start frame/reference frame.

## Diagnostics

If the UI highlights but the file does not appear, open the extension diagnostics panel and look for:

- `google_flow_drag_delivery`
- `strategy`
  - `synthetic_drop_then_file_input` means the fallback successfully set a file input.
  - `synthetic_drop_only` means no usable file input accepted the file.
- `fallbackStep`
  - `file_input_initial` means the input was ready immediately.
  - `file_input_retry` means the input appeared after the short retry.
- `fileInput`
  - Check `accept`, `disabled`, `hidden`, `filesLength`, `ariaLabel`, and `className`.

Send the latest diagnostic entry if Flow still does not accept the file.

## Notes

- The bridge intentionally sends synthetic drag events first so Flow can show its native hover/drop UI.
- It then sets the nearest compatible file input as a fallback because Flow may render a valid hover state without committing synthetic drop files.
- Node must be `22.22.3` or compatible with the root `engines.node` range before running install/package commands.
