import {
  browserSessionLaunchContextSchema,
  type BrowserSessionLaunchContext,
} from "@shared/browserSession";

const LAUNCH_CONTEXT_PARAM = "browserSession";

function fallbackPathForLaunchContext(
  launchContext: BrowserSessionLaunchContext | null,
): string {
  if (!launchContext) {
    return "/dashboard";
  }

  switch (launchContext.originSurface) {
    case "chat":
      return launchContext.sourceId ? `/chat?c=${encodeURIComponent(launchContext.sourceId)}` : "/chat";
    case "agency":
      return launchContext.sourceId ? `/agencies/${encodeURIComponent(launchContext.sourceId)}` : "/agencies";
    case "workflow":
      return launchContext.sourceId ? `/workflows/editor/${encodeURIComponent(launchContext.sourceId)}` : "/workflows";
    case "automation":
      return "/automation";
    default:
      return "/dashboard";
  }
}

function isSafeRelativePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

export function buildBrowserSessionPath(
  sessionId: string,
  launchContext?: BrowserSessionLaunchContext | null,
): string {
  const path = `/automation/live/${encodeURIComponent(sessionId)}`;
  if (!launchContext) {
    return path;
  }

  const params = new URLSearchParams();
  params.set(LAUNCH_CONTEXT_PARAM, JSON.stringify(launchContext));
  return `${path}?${params.toString()}`;
}

export function parseBrowserSessionLaunchContext(
  search: string,
): BrowserSessionLaunchContext | null {
  const params = new URLSearchParams(search);
  const encoded = params.get(LAUNCH_CONTEXT_PARAM);
  if (!encoded) {
    return null;
  }

  try {
    return browserSessionLaunchContextSchema.parse(JSON.parse(encoded));
  } catch {
    return null;
  }
}

export function resolveBrowserSessionReturnPath(
  launchContext: BrowserSessionLaunchContext | null,
): string {
  const explicitPath = launchContext?.returnContext?.path;
  if (explicitPath && isSafeRelativePath(explicitPath)) {
    return explicitPath;
  }

  return fallbackPathForLaunchContext(launchContext);
}

