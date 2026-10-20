// Temporarily pause stale macOS rendering packs. Keep archives and catalog
// history for rollback; independent Hermes packs and native app installers stay active.
const pausedPacks = [
  ["hyperframes-macos-arm64", "smart-ai-hub-worker-runtime-hyperframes-macos-arm64-"],
  ["remotion-executor-macos-arm64", "smart-ai-hub-remotion-executor-remotion-executor-macos-arm64-"],
  ["remotion-executor-macos-x64", "smart-ai-hub-remotion-executor-remotion-executor-macos-x64-"],
];

export function isRuntimePackPaused(runtimeId) {
  return pausedPacks.some(([id]) => id === runtimeId);
}

// Covers ZIP archives, sidecar manifests and checksums without excluding other
// macOS downloads. Accept relative paths for the API and both artifact builders.
export function isRuntimePackFilePaused(filePath) {
  const fileName = filePath.split(/[\\/]/).pop() ?? "";
  return pausedPacks.some(([, prefix]) => fileName.startsWith(prefix));
}

export const RUNTIME_PACK_PAUSED_MESSAGE =
  "Distribution of this macOS rendering runtime pack is temporarily paused. Existing archives and release history are retained.";
