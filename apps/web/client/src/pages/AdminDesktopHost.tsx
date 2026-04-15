import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { HelpButton } from "@/components/help";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSurface } from "@/components/dashboard";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { DesktopReleaseConfigPanel } from "@/features/desktop-releases/DesktopReleaseConfigPanel";
import { DesktopReleasePanel } from "@/features/desktop-releases/DesktopReleasePanel";

function roleLabel(role?: string | null) {
  if (role === "admin") {
    return "Admin";
  }
  if (role === "domain_admin") {
    return "Domain admin";
  }
  return "Team member";
}

export default function AdminDesktopHost() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const desktopHostEnabled = useTenantFeatureFlag("desktopHostEnabled");
  const desktopAdvancedLocalModeEnabled = useTenantFeatureFlag("desktopAdvancedLocalMode");
  const canManageReleaseSettings = user?.role === "admin";

  const releaseWorkspacePath = user?.role === "admin" ? "/admin/desktop-host" : "/domain-admin/desktop-host";
  const governancePath = user?.role === "admin"
    ? "/admin/desktop-host/governance"
    : "/domain-admin/desktop-host/governance";

  const heroBadges = useMemo(
    () => [
      {
        label: roleLabel(user?.role),
        className: "border-sky-200 bg-white text-sky-700",
      },
      {
        label: desktopHostEnabled ? "Desktop Host enabled" : "Desktop Host preview",
        className: desktopHostEnabled
          ? "border-emerald-200 bg-white text-emerald-700"
          : "border-amber-200 bg-white text-amber-700",
      },
      {
        label: desktopAdvancedLocalModeEnabled ? "Advanced local mode" : "Managed release mode",
        className: "border-slate-200 bg-white text-slate-700",
      },
    ],
    [desktopAdvancedLocalModeEnabled, desktopHostEnabled, user?.role],
  );

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
      <DashboardSurface className="overflow-hidden bg-gradient-to-br from-sky-50 via-white to-cyan-50">
        <div className="flex flex-col gap-6 p-6 lg:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
                <Sparkles className="h-4 w-4" />
                Release console
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Desktop release console
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                  Prepare Windows, macOS, and Linux releases in one workspace.
                  Keep build settings, upload, and publishing together while
                  governance lives in a separate console.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {heroBadges.map((badge) => (
                  <Badge
                    key={badge.label}
                    variant="outline"
                    className={badge.className}
                  >
                    {badge.label}
                  </Badge>
                ))}
                <Badge variant="outline" className="border-indigo-200 bg-white text-indigo-700">
                  Windows / macOS / Linux
                </Badge>
                <Badge variant="outline" className="border-cyan-200 bg-white text-cyan-700">
                  Build + publish
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to dashboard
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(governancePath)}
              >
                <MonitorPlay className="mr-2 h-4 w-4" />
                Open governance console
              </Button>
              <HelpButton
                page={releaseWorkspacePath}
                topic="desktop-host"
                variant="outline"
                size="sm"
                label="Help"
              />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Focus
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Release preparation, progress, and publishing live together here.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Primary job
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Trigger builds, upload artifacts, and keep downloads current.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-white/90 p-4 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Advanced console
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Device posture, roots, and rollout controls stay in governance.
              </p>
            </div>
          </div>
        </div>
      </DashboardSurface>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
        <DesktopReleasePanel
          variant="admin"
          enabled={Boolean(user)}
          canTriggerBuild={user?.role === "admin"}
        />

        <div className="space-y-6">
          {canManageReleaseSettings ? (
            <DashboardSurface className="overflow-hidden">
              <div className="border-b border-slate-200/80 px-5 pt-5 sm:px-6 sm:pt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Source settings
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-900">
                      Configuration and publishing
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Keep the repository, workflow, ref, and token in one place.
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-white text-emerald-700"
                  >
                    Admin only
                  </Badge>
                </div>
              </div>
              <div className="p-5 sm:p-6">
                <DesktopReleaseConfigPanel enabled />
              </div>
            </DashboardSurface>
          ) : null}

          <DashboardSurface>
            <div className="border-b border-slate-200/80 px-5 pt-5 sm:px-6 sm:pt-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Release flow
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-900">
                    Suggested sequence
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    A clear path from configuration to upload and publication.
                  </p>
                </div>
                <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Installer ready
                </Badge>
              </div>
            </div>
            <div className="space-y-3 p-5 sm:p-6">
              {[
                {
                  step: "1",
                  title: "Review source settings",
                  text: "Confirm the repository, workflow, and release URL before building.",
                },
                {
                  step: "2",
                  title: "Trigger the build",
                  text: "Choose the version and platform, then dispatch the GitHub workflow.",
                },
                {
                  step: "3",
                  title: "Upload the artifact",
                  text: "Attach the generated installer or archive once the build completes.",
                },
                {
                  step: "4",
                  title: "Publish and share",
                  text: "Mark the release live so dashboard users can download it immediately.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                    {item.step}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.text}</p>
                  </div>
                </div>
              ))}
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-sky-800">
                  <ShieldCheck className="h-4 w-4" />
                  Governance is separate
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Device posture, local roots, and rollout controls now live in the dedicated governance console.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4"
                  onClick={() => navigate(governancePath)}
                >
                  Open governance guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </DashboardSurface>
        </div>
      </div>
    </div>
  );
}
