import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Copy, Download, ExternalLink, MonitorPlay } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildDesktopLaunchUri } from "@/features/desktop-host/labels";

function getSearchParam(search: string, key: string): string | undefined {
  const value = new URLSearchParams(search).get(key);
  return value && value.trim().length > 0 ? value : undefined;
}

export default function DesktopOpen() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const launchUri = useMemo(() => buildDesktopLaunchUri({
    runId: getSearchParam(search, "runId"),
    projectId: getSearchParam(search, "projectId"),
    skillId: getSearchParam(search, "skillId"),
    agencyId: getSearchParam(search, "agencyId"),
  }), [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.assign(launchUri);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [launchUri]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
            <MonitorPlay className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Open in SmartSpecPro Desktop</h1>
            <p className="mt-1 text-sm text-slate-600">
              We tried to hand this run off to Desktop Host. If the desktop app does not open, use
              the launch link or install help below.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
          {launchUri}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => window.location.assign(launchUri)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Try opening Desktop again
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(launchUri);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {copied ? "Copied" : "Copy launch link"}
          </Button>
          <a
            href="/help/desktop-host-managed-mode"
            className="inline-flex items-center rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="mr-2 h-4 w-4" />
            Desktop install help
          </a>
        </div>

        <div className="mt-8">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
