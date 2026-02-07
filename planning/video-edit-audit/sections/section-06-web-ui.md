Now I have a thorough understanding of the codebase state and what this section requires. Let me generate the section content.

# Section 06: Web UI -- Enable Video Editor on Web Browsers

## Overview

This section makes the video editor work in web browsers, not just the Tauri desktop app. Currently, the `/video-editor` route has a Tauri-only guard that renders a `DesktopOnlyMessage` when accessed from a web browser. This section removes that guard, introduces platform-aware abstractions for file I/O, project management, media upload, and preview playback, and adds the video editor to the web navigation menu.

**Dependencies**: This section depends on:
- **section-01-job-spec-types**: The shared `MediaJobSpec` types in `apps/web/shared/types/mediaJob.ts`
- **section-02-media-job-client**: The `MediaJobClient` and `IEngineAdapter` interface
- **section-04-web-engine-adapter**: The `WebEngineAdapter`, Node.js API routes (`mediaJobs.ts`), and the `POST /api/media-jobs/upload` endpoint
- **section-05-frontend-consolidation**: The consolidated `VideoEditor.tsx` component wired to `MediaJobClient`, and the ms-based time units

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/client/src/services/webAssetResolver.ts` | Upload files to server, resolve asset URIs for web platform |
| `apps/web/client/src/services/webProjectManager.ts` | Save/load/export/import projects on web (API + IndexedDB + browser download) |
| `apps/web/client/src/services/__tests__/webAssetResolver.test.ts` | Tests for WebAssetResolver |
| `apps/web/client/src/services/__tests__/webProjectManager.test.ts` | Tests for WebProjectManager |
| `apps/web/client/src/components/videoeditor/__tests__/VideoEditor.test.tsx` | Tests for consolidated VideoEditor on web |

## Files to Modify

| File | Changes |
|------|---------|
| `apps/web/client/src/pages/VideoEditorPage.tsx` | Remove Tauri-only guard, render editor on both platforms |
| `packages/shared/src/constants/menu.ts` | Change video-editor menu item `platforms` from `['desktop']` to `['web', 'desktop']` |
| `apps/web/client/src/components/videoeditor/MediaLibraryPanel.tsx` | Add "Upload Media" button for web, support `https://` URIs |
| `apps/web/client/src/components/videoeditor/ExportDialog.tsx` | Web: trigger browser download; Desktop: save dialog |
| `apps/web/client/src/components/videoeditor/PreviewPlayer.tsx` | Web: use HTML5 `<video>` with `https://` source URLs |
| `apps/web/client/src/services/projectManager.ts` | Add platform detection, delegate to `WebProjectManager` on web |

---

## Tests FIRST

All tests use Vitest. Run with `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`.

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/webAssetResolver.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for WebAssetResolver
 *
 * WebAssetResolver handles uploading local files to the server and
 * returning https:// URIs that work in the web browser context.
 */
describe("WebAssetResolver", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uploadAsset sends file to upload endpoint and returns URI", async () => {
    // Stub: POST /api/media-jobs/upload with a File object
    // Expect: returns { uri: "https://..." } with the server-assigned URL
  });

  it("resolveAsset returns https URL for web assets", async () => {
    // Given an asset with a server-relative URI
    // Expect: resolveAsset returns a fully qualified https:// URL
  });

  it("resolveAsset caches resolved URLs", async () => {
    // Call resolveAsset twice with the same assetId
    // Expect: only one network request, second call returns cached result
  });

  it("uploadAsset validates file size before uploading", async () => {
    // Create a mock File exceeding 2GB
    // Expect: throws an error without making a network request
  });

  it("uploadAsset validates content type via file extension", async () => {
    // Create a File with a disallowed extension (e.g., .exe)
    // Expect: throws an error about unsupported file type
  });
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/__tests__/webProjectManager.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for WebProjectManager
 *
 * WebProjectManager handles project persistence on the web platform:
 * - Save to server API
 * - Load from server API
 * - Export as .videoproj file (browser download)
 * - Import from .videoproj file (browser file input)
 */
describe("WebProjectManager", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("saveProject stores project JSON to API", async () => {
    // Stub: POST /api/media-jobs/projects with project JSON body
    // Expect: returns { projectId: "..." }
  });

  it("loadProject retrieves project JSON from API", async () => {
    // Stub: GET /api/media-jobs/projects/:id returns project JSON
    // Expect: returns a valid VideoEditorProject object
  });

  it("exportProject triggers browser download of .videoproj file", async () => {
    // Call exportProject with a project object
    // Expect: creates a Blob, generates an object URL, triggers a download link click
  });

  it("importProject reads .videoproj file from browser file input", async () => {
    // Create a mock File containing valid project JSON
    // Expect: returns the parsed VideoEditorProject object
  });

  it("importProject rejects invalid project JSON", async () => {
    // Create a mock File containing invalid JSON
    // Expect: throws a validation error
  });
});
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/__tests__/VideoEditor.test.tsx`

```typescript
import { describe, it, expect, vi } from "vitest";

/**
 * Tests for the consolidated VideoEditor component running on web.
 *
 * These tests verify that the VideoEditor renders correctly in a web
 * browser context (no Tauri), uses the WebEngineAdapter, and that
 * platform-specific UI elements appear correctly.
 */
describe("VideoEditor (Web UI)", () => {
  it("VideoEditor renders without crashing", () => {
    // Render the VideoEditor component in a test wrapper
    // Expect: no error, component mounts
  });

  it("VideoEditor detects platform and uses correct adapter", () => {
    // When window.__TAURI__ is NOT defined
    // Expect: MediaJobClient internally selects WebEngineAdapter
  });

  it("MediaLibraryPanel shows upload button on web", () => {
    // Render MediaLibraryPanel without Tauri context
    // Expect: an "Upload Media" button is visible
  });

  it("MediaLibraryPanel shows generated media from backend", () => {
    // Stub the media library fetch to return mock assets
    // Expect: assets are rendered in the media grid
  });

  it("ExportDialog triggers download on web platform", () => {
    // Render ExportDialog in web context
    // Click export button
    // Expect: browser download is triggered (Blob URL), NOT a Tauri save dialog
  });

  it("ExportDialog triggers save dialog on desktop platform", () => {
    // Mock window.__TAURI__
    // Render ExportDialog
    // Click export button
    // Expect: Tauri save dialog is invoked
  });

  it("WaveformCanvas renders peaks from waveform_peaks job result", () => {
    // Provide real peak data (e.g., [0.1, 0.5, 0.9, 0.3])
    // Render WaveformCanvas
    // Expect: canvas element is present and non-empty
  });

  it("SilenceDetectionPanel calls detectDeadAir on analyze button click", () => {
    // Stub MediaJobClient.detectDeadAir
    // Click the "Analyze" button
    // Expect: detectDeadAir is called with correct parameters
  });

  it("SilenceDetectionPanel displays detected silence regions", () => {
    // Provide mock silence regions
    // Expect: regions are rendered in the panel list
  });

  it("SilenceDetectionPanel calls cutDeadAir on remove button click", () => {
    // Provide mock silence regions, click "Remove"
    // Expect: cutDeadAir is called with the selected regions
  });

  it("PreviewPlayer uses HTML5 video on web", () => {
    // Render PreviewPlayer with an https:// URL
    // Expect: a <video> element is rendered with the correct src
  });
});
```

---

## Implementation Details

### 1. Remove Tauri-Only Guard from VideoEditorPage

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/VideoEditorPage.tsx`

Currently this file checks `detectPlatform()` and shows `DesktopOnlyMessage` if not on desktop. The entire guard must be removed so the video editor renders on both web and desktop.

The updated component should:
- Remove the `if (platform !== 'desktop')` guard entirely
- Import and render the consolidated `VideoEditor` component (from section-05)
- The `VideoEditor` internally uses `MediaJobClient` which auto-selects the correct engine adapter based on platform

The resulting component is straightforward:
```typescript
// Simplified: just render the editor on any platform
export default function VideoEditorPage() {
  return <VideoEditor />;
}
```

The `DesktopOnlyMessage` import and `detectPlatform` import can be removed from this file since they are no longer needed here. Note that `DesktopOnlyMessage` is still used by other pages (Docker, Terminal, etc.) so the component itself should NOT be deleted.

### 2. Update Navigation Menu to Include Web Platform

**File**: `/home/dev/projects/SmartSpecPro/packages/shared/src/constants/menu.ts`

The video-editor menu item at line 33 currently has `platforms: ['desktop']`. Change this to `platforms: ['web', 'desktop']` so the video editor appears in the sidebar navigation on both platforms.

Current line:
```typescript
{ id: 'video-editor', label: 'Video Editor', labelTh: 'ตัดต่อวีดีโอ', icon: 'Film', path: '/video-editor', platforms: ['desktop'], group: 'main', sortOrder: 8.5 },
```

Updated line:
```typescript
{ id: 'video-editor', label: 'Video Editor', labelTh: 'ตัดต่อวีดีโอ', icon: 'Film', path: '/video-editor', platforms: ['web', 'desktop'], group: 'main', sortOrder: 8.5 },
```

The `useMenuItems.ts` hook at `/home/dev/projects/SmartSpecPro/apps/web/client/src/hooks/useMenuItems.ts` already has the `Film` icon imported and mapped in the `iconMap` (line 32 and line 75), so no changes are needed there.

The route `/video-editor` is already registered in `App.tsx` at line 138:
```tsx
<Route path="/video-editor" component={VideoEditorPage} />
```
No changes needed to routing.

### 3. Create WebAssetResolver

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/webAssetResolver.ts`

This service handles asset upload and URI resolution for the web platform. It replaces Tauri's `invoke('save_blob_to_file')` with HTTP uploads.

The class should provide:

- **`uploadAsset(file: File): Promise<{ assetId: string; uri: string }>`**
  - Validates file size (max 2GB, configurable)
  - Validates file extension against an allowlist: `mp4, webm, mov, avi, mp3, wav, ogg, flac, srt, vtt, jpg, jpeg, png, webp`
  - Sends the file as multipart form data to `POST /api/media-jobs/upload` (created in section-04)
  - Returns the server-assigned `assetId` and the `https://` URI for the uploaded file

- **`resolveAsset(assetId: string): Promise<string>`**
  - Returns the `https://` URL for a previously uploaded asset
  - Caches resolved URLs in a `Map<string, string>` to avoid redundant lookups

- **`clearCache(): void`**
  - Clears the in-memory URL cache

Key design notes:
- The upload endpoint follows the existing upload pattern in the codebase (see `apps/web/server/routers.ts` `ai.upload` procedure for the magic byte validation pattern)
- Uploaded files go to S3/R2 (existing object storage) with auto-cleanup after 24h
- Content type validation should check magic bytes, not just file extension (follow the existing pattern from `ai.upload`)
- The maximum file size of 2GB is much larger than the existing 15MB chat upload limit -- this is intentional for video files

### 4. Create WebProjectManager

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/webProjectManager.ts`

This service replaces the Tauri-based `projectManager.ts` (which uses `readTextFile`, `writeTextFile`, and Tauri file dialogs) with web-compatible alternatives.

The existing `projectManager.ts` at `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/projectManager.ts` imports from `@tauri-apps/api/core`, `@tauri-apps/plugin-dialog`, and `@tauri-apps/plugin-fs`. These are unavailable on web.

The `WebProjectManager` class should provide:

- **`saveProject(project: VideoEditorProject): Promise<string>`**
  - Serializes the project to JSON
  - Posts to server API endpoint (e.g., `POST /api/media-jobs/projects`) or stores in IndexedDB
  - Returns a project ID for later retrieval

- **`loadProject(projectId: string): Promise<VideoEditorProject>`**
  - Fetches project JSON from server API or IndexedDB
  - Runs the same validation as the existing `validateProjectStructure()` in `projectManager.ts`
  - If project version is `"1.0"` (seconds), auto-migrates to `"2.0"` (ms) -- this migration logic is defined in section-05

- **`exportProject(project: VideoEditorProject): Promise<void>`**
  - Serializes project to JSON
  - Creates a `Blob` with type `application/json`
  - Generates a download URL via `URL.createObjectURL()`
  - Creates a temporary `<a>` element with `download` attribute set to `{project.name}.videoproj`
  - Triggers a click to initiate the browser download
  - Revokes the object URL after download

- **`importProject(file: File): Promise<VideoEditorProject>`**
  - Reads the File contents via `FileReader` or `file.text()`
  - Parses the JSON
  - Validates with `validateProjectStructure()`
  - Returns the validated project object

- **`listProjects(): Promise<Array<{ id: string; name: string; updatedAt: Date }>>`**
  - Lists saved projects from server or IndexedDB
  - Used to populate a "Recent Projects" UI

### 5. Update ProjectManager to Detect Platform

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/services/projectManager.ts`

The existing project manager at this path directly imports from `@tauri-apps/api/core` and other Tauri packages at the top level. This causes import errors when running on web.

The modification approach:
- Add a platform check using `detectPlatform()` from `@smartspec/shared`
- On web, delegate to `WebProjectManager`
- On desktop, use the existing Tauri-based logic
- Use dynamic imports (`await import(...)`) for Tauri APIs so they are not loaded at bundle time on web
- Export a unified `saveProject`, `loadProject`, `exportProject`, `importProject` API that works on both platforms

The key is that Tauri imports must not be statically imported at the module level, because on web, those packages do not exist and the import would fail. Use lazy/dynamic imports guarded by platform detection.

### 6. Update MediaLibraryPanel for Web

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/MediaLibraryPanel.tsx`

Current behavior: The panel fetches generated media from the backend and provides "Add to Timeline" functionality. The `handleAddToTimeline` function calls `videoEditorMediaLibrary.downloadToWorkspace(asset)` which downloads the file locally via Tauri, then probes it locally.

Changes for web support:

- **Add "Upload Media" button** (web-only) in the header next to the existing tabs
  - Uses an HTML `<input type="file" accept="video/*,audio/*">` hidden element
  - On file selection, calls `WebAssetResolver.uploadAsset(file)` to upload to the server
  - After upload, adds the asset to the library list with the returned `https://` URI

- **Platform-aware asset handling**:
  - **Desktop**: Keeps the existing flow (download to workspace, reference by `file://` path)
  - **Web**: Skips the local download entirely -- references assets by their `https://` URL directly
  - Use `detectPlatform()` to branch between the two flows

- **Platform-aware `handleAddToTimeline`**:
  - **Desktop**: Download to workspace, probe locally, add to timeline (existing flow)
  - **Web**: Use the `https://` URL directly, probe via `MediaJobClient.probe(uri)` instead of local FFmpeg, add to timeline

### 7. Update ExportDialog for Web

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/ExportDialog.tsx`

Current behavior: The `handleExport` function calls `onExport(outputPath, customSettings)` which eventually invokes Tauri commands to save to a local file path.

Changes for web support:

- **Platform-aware export flow**:
  - **Desktop**: Keep the existing behavior (output path, Tauri save dialog)
  - **Web**: The `outputPath` field becomes a suggested filename for the browser download
  - On web, `onExport` should:
    1. Submit a render job via `MediaJobClient.renderMp4()`
    2. Wait for completion with progress updates
    3. When complete, the server returns an artifact URL
    4. Trigger a browser download of the rendered file from that URL

- **Output File section UI change**:
  - Desktop: Shows a text input for file path
  - Web: Shows a text input labeled "Download filename" -- the actual server-side path is managed by the backend

- **Encoder detection**:
  - Desktop: Calls `videoEditorMediaLibrary.detectEncoders()` via Tauri
  - Web: Uses a fixed set of software encoders available on the server (e.g., `libx264`, `libx265`), or fetches available encoders from the server API

### 8. Update PreviewPlayer for Web

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/videoeditor/PreviewPlayer.tsx`

The current `PreviewPlayer` already uses a standard HTML5 `<video>` element (line 379-386) and accepts a `previewVideoUrl` prop. It is largely platform-agnostic.

Minimal changes needed:
- Ensure the `previewVideoUrl` prop works with `https://` URLs (it already does -- the `<video>` element handles this natively)
- If the media URL requires authentication/CORS headers, proxy through the server (use the existing media proxy pattern if one exists)
- The component is already accessible and has keyboard shortcuts -- no changes needed there

The main concern is CORS: if assets are served from S3/R2, ensure the bucket has proper CORS headers to allow `<video>` playback from the app's domain. This is a server/infrastructure configuration, not a frontend code change.

### 9. Platform Detection Pattern

Throughout the modified components, use the existing `detectPlatform()` function from `@smartspec/shared` (defined in `/home/dev/projects/SmartSpecPro/packages/shared/src/constants/platform.ts`):

```typescript
import { detectPlatform } from '@smartspec/shared';

const platform = detectPlatform(); // 'web' | 'desktop'
const isWeb = platform === 'web';
```

This function checks for `window.__TAURI__` and returns `'desktop'` if present, `'web'` otherwise. It is already used throughout the codebase (e.g., in `useMenuItems.ts` and `VideoEditorPage.tsx`).

---

## Implementation Checklist

1. Write tests for `WebAssetResolver` and `WebProjectManager`
2. Write tests for `VideoEditor` web rendering
3. Implement `WebAssetResolver` service
4. Implement `WebProjectManager` service
5. Modify `projectManager.ts` to use dynamic Tauri imports and delegate to `WebProjectManager` on web
6. Modify `VideoEditorPage.tsx` to remove the Tauri-only guard
7. Modify `menu.ts` to add `'web'` to the video-editor platforms array
8. Modify `MediaLibraryPanel.tsx` to add upload button and platform-aware asset handling
9. Modify `ExportDialog.tsx` for platform-aware export (browser download on web)
10. Verify `PreviewPlayer.tsx` works with `https://` URLs (likely no code changes needed)
11. Run all tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test`
12. Verify the video editor loads in a web browser by navigating to `/video-editor`
13. Verify the video editor still works in the Tauri desktop app

## Key Design Decisions

- **No new routes needed in `App.tsx`**: The `/video-editor` route already exists at line 138. Only the page component changes.
- **No new icon needed in `useMenuItems.ts`**: The `Film` icon is already imported and mapped.
- **IndexedDB as offline fallback**: `WebProjectManager` uses server-side storage as primary and IndexedDB as a fallback for offline/draft scenarios. This is optional for the initial implementation -- server-only is acceptable for v0.1.
- **Upload size limit (2GB)**: Significantly larger than the 15MB chat upload limit because video files are large. This must be enforced both client-side (in `WebAssetResolver`) and server-side (in the upload endpoint from section-04).
- **No changes to `packages/shared/src/constants/platform.ts`**: The `detectPlatform()` function works correctly as-is.