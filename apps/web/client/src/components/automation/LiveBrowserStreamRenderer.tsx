import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  MonitorPlay,
  Wifi,
  WifiOff,
} from "lucide-react";

import type { LiveBrowserSession } from "@shared/liveBrowser";
import {
  resolveLiveBrowserStreamTarget,
  type LiveReconnectState,
} from "@/lib/liveBrowserStream";

interface LiveBrowserStreamRendererProps {
  session: LiveBrowserSession;
  reconnectState: LiveReconnectState;
  compactViewport: boolean;
  embedBaseUrl?: string | null;
}

export function LiveBrowserStreamRenderer({
  session,
  reconnectState,
  compactViewport,
  embedBaseUrl,
}: LiveBrowserStreamRendererProps) {
  const target = resolveLiveBrowserStreamTarget(session, {
    reconnectState,
    compactViewport,
    embedBaseUrl,
  });
  const [frameState, setFrameState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    if (!target.available) {
      setFrameState("failed");
      return;
    }
    setFrameState("loading");
  }, [target.available, target.available ? target.url : null]);

  if (!target.available || frameState === "failed") {
    const reason = target.available
      ? "The embedded browser viewport failed to load. Refresh the session to try again."
      : target.reason;
    return (
      <div
        className="rounded-lg border border-amber-300 bg-amber-50/90 p-4 text-slate-900"
        data-testid="live-browser-stream-unavailable"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-amber-900">Live viewport unavailable</p>
            <p className="text-xs text-amber-900/90">{reason}</p>
          </div>
        </div>
      </div>
    );
  }

  const overlayLabel = target.interactive
    ? "Takeover Active"
    : "Observe Mode";

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
      data-testid="live-browser-stream-renderer"
    >
      <iframe
        key={target.url}
        title="Live Browser Viewport"
        src={target.url}
        className="h-[360px] w-full bg-white"
        sandbox="allow-scripts allow-same-origin"
        allow={target.interactive ? "clipboard-read; clipboard-write" : ""}
        onLoad={() => setFrameState("ready")}
        onError={() => setFrameState("failed")}
      />

      {!target.interactive ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-transparent"
          style={{ pointerEvents: "auto" }}
        />
      ) : null}

      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-slate-950/85 px-3 py-1 text-[11px] font-medium text-slate-100 shadow-sm">
        <MonitorPlay className="h-3.5 w-3.5 text-cyan-300" />
        {overlayLabel}
      </div>

      <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full bg-slate-950/85 px-3 py-1 text-[11px] font-medium text-slate-100 shadow-sm">
        {reconnectState === "connected" ? (
          <Wifi className="h-3.5 w-3.5 text-emerald-300" />
        ) : (
          <WifiOff className="h-3.5 w-3.5 text-amber-300" />
        )}
        {reconnectState === "connected" ? "Attached" : "Recovering"}
      </div>

      {(frameState === "loading" || reconnectState === "reconnecting") ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/35 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-full bg-slate-950/90 px-3 py-1.5 text-xs text-slate-100 shadow-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
            {reconnectState === "reconnecting" ? "Reconnecting stream..." : "Loading viewport..."}
          </div>
        </div>
      ) : null}
    </div>
  );
}
