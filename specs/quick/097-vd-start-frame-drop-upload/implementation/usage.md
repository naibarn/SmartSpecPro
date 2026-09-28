# Usage Guide

## Quick Start

In a Vertical Drama episode storyboard, drag an image file from the computer onto a
shot's 9:16 Start Frame thumbnail. The thumbnail displays a busy overlay while the app
uploads the file, resolves it as a media asset, and saves it as that shot's approved
Start Frame. The existing frame remains visible if any step fails.

Existing Library/History image URL drops continue to work and skip the upload step.

## Supported Input

- local browser `File` values with an `image/*` MIME type, up to 15 MB;
- existing durable application image URLs;
- inline image data URLs, which are uploaded before persistence.

Local files and inline data URLs are rejected client-side when their decoded content
exceeds 15 MB; the existing upload endpoint also enforces its server-side limit.

## Verification

```bash
cd /home/dev/projects/SmartSpecPro/apps/web
npm exec -- vitest run client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel.startFrameDropUpload.test.tsx client/src/lib/__tests__/verticalDramaStartFrameDrop.test.ts
npm run check
```
