import React from "react";
import { createRoot } from "react-dom/client";
import { WorkerAppProvider } from "../../src/app/workerContext";
import { MediaWorkspaceHost } from "../../src/screens/media-workspace/MediaWorkspaceHost";
import { SandboxedOverlayViewer } from "../../src/screens/media-workspace/SandboxedOverlayViewer";
import { CodeOverlayModal } from "../../src/screens/media-workspace/CodeOverlayModal";
import "../../src/styles.css";

const file = { name: "video.mp4", path: "/fixture/video.mp4", isDirectory: false, sizeBytes: 123, modifiedUnixMs: 1, extension: "mp4", isVideo: true };
(window as any).__TAURI_INTERNALS__ = {
  convertFileSrc: () => "data:video/mp4;base64,",
  invoke: async (command: string) => {
    if (command === "worker_app_browse_directory") return { currentPath: "/fixture", parentPath: null, breadcrumbs: [], entries: [file, { ...file, name: "bad.ssproj", path: "/fixture/bad.ssproj", extension: "ssproj", isVideo: false }], totalFolders: 0, totalFiles: 2, totalVideoFiles: 1 };
    if (command === "worker_app_load_nle_project") return '{}';
    if (command === "worker_app_detect_silence_custom") return {durationMs: 1000, silenceSegments: [], waveformPeaks: [0.2], cutCount: 0, timeSavedMs: 0};
    throw new Error(`Unsupported fixture command: ${command}`);
  },
};
const attack = '<img src="https://overlay.invalid/steal" onerror="parent.pwned=true"><script>parent.pwned=true</script><span>Safe overlay</span>';
const security = new URLSearchParams(location.search).has("security");
createRoot(document.getElementById("root")!).render(security ? <>
  <SandboxedOverlayViewer activeClips={[
    {id: "code", name: "sandbox test", sourceType: "generated_code", codeEngine: "react_css", componentCode: attack, customCss: 'body{display:none}', timelineStartMs: 0, durationMs: 1000},
    {id: "svg", name: "svg test", sourceType: "generated_code", svgContent: '<svg xmlns="http://www.w3.org/2000/svg" onload="parent.pwned=true"><script>parent.pwned=true</script><circle r="10"/></svg>', timelineStartMs: 0, durationMs: 1000},
  ]} currentTimeMs={1} width={1080} height={1920} />
  <CodeOverlayModal isOpen onClose={() => {}} currentTimeMs={0} onAddCodeOverlay={() => {}} />
</> : <WorkerAppProvider activeRoute="media-workspace" locale="th"><MediaWorkspaceHost workspace={{status: "ready", fileCount: 2, totalBytes: 123, localPath: "/fixture"}} scan={null} plan={null} busy={false} /></WorkerAppProvider>);
