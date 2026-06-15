const SUPPORTED_NODE_MIN = [22, 22, 0] as const;
const SUPPORTED_NODE_MAX_EXCLUSIVE = [23, 0, 0] as const;

export function parseNodeVersion(raw: string): [number, number, number] | null {
  const match = raw.trim().replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function isSupportedSmartSpecNodeVersion(raw: string): boolean {
  const version = parseNodeVersion(raw);
  if (!version) return false;
  return (
    compareVersion(version, SUPPORTED_NODE_MIN) >= 0 &&
    compareVersion(version, SUPPORTED_NODE_MAX_EXCLUSIVE) < 0
  );
}

export function assertSupportedNodeRuntime(raw = process.version): void {
  if (isSupportedSmartSpecNodeVersion(raw)) return;
  throw new Error(
    `SmartSpecPro web server requires Node >=22.22.0 <23. Current Node is ${raw}. ` +
      "Use /home/dev/.nvm/versions/node/v22.22.3/bin/node or run nvm use 22.22.3 before starting the service."
  );
}

assertSupportedNodeRuntime();
