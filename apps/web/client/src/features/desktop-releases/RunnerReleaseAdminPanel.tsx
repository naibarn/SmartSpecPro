import { useEffect, useState } from "react";
import { KeyRound, Loader2, Play, RefreshCw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";
import { trpc } from "@/lib/trpc";

type BuildStatus = {
  id: string;
  version: string;
  releaseId: string;
  status: string;
  publish: boolean;
  syncStatus: string;
  workflowRunUrl: string | null;
  syncError: string | null;
};

type GuideTranslation = (key: string) => string;

function RunnerSigningGuide({ t }: { t: GuideTranslation }) {
  const codeClassName = "mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs leading-5 text-slate-100";
  const sectionClassName = "rounded-xl border border-indigo-100 bg-white/80 px-4 py-3";

  return (
    <section className="mt-6 rounded-2xl border border-indigo-200 bg-white/85 p-4 shadow-sm" aria-labelledby="runner-signing-guide-heading">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-indigo-100 p-2 text-indigo-700"><KeyRound className="h-5 w-5" aria-hidden="true" /></span>
        <section className="min-w-0">
          <h3 id="runner-signing-guide-heading" className="text-lg font-semibold text-slate-900">{t("dashboard:runnerReleases.admin.signingGuide.title")}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{t("dashboard:runnerReleases.admin.signingGuide.intro")}</p>
        </section>
      </header>

      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-950" role="note">
        <strong>{t("dashboard:runnerReleases.admin.signingGuide.privateKeyLabel")}:</strong> {t("dashboard:runnerReleases.admin.signingGuide.privateKeyWarning")}
      </p>

      <section className="mt-4 space-y-2" aria-label={t("dashboard:runnerReleases.admin.signingGuide.title")}>
        <details className={sectionClassName} open>
          <summary className="cursor-pointer font-medium text-slate-900">{t("dashboard:runnerReleases.admin.signingGuide.section.what")}</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("dashboard:runnerReleases.admin.signingGuide.whatBody")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
            <li><code>RUNNER_SIGNING_KEY</code> {t("dashboard:runnerReleases.admin.signingGuide.whatPrivate")}</li>
            <li><code>SAH_RUNNER_RELEASE_PUBLIC_KEY</code> {t("dashboard:runnerReleases.admin.signingGuide.whatPublic")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.whatBoundary")}</li>
          </ul>
        </details>

        <details className={sectionClassName}>
          <summary className="cursor-pointer font-medium text-slate-900">{t("dashboard:runnerReleases.admin.signingGuide.section.generate")}</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("dashboard:runnerReleases.admin.signingGuide.generateBody")}</p>
          <pre className={codeClassName}><code>{t("dashboard:runnerReleases.admin.signingGuide.generateCommand")}</code></pre>
          <p className="mt-2 text-xs leading-5 text-slate-500">{t("dashboard:runnerReleases.admin.signingGuide.generateNote")}</p>
        </details>

        <details className={sectionClassName}>
          <summary className="cursor-pointer font-medium text-slate-900">{t("dashboard:runnerReleases.admin.signingGuide.section.test")}</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("dashboard:runnerReleases.admin.signingGuide.testBody")}</p>
          <pre className={codeClassName}><code>{t("dashboard:runnerReleases.admin.signingGuide.testCommand")}</code></pre>
          <p className="mt-2 text-sm font-medium text-emerald-700">{t("dashboard:runnerReleases.admin.signingGuide.testExpected")}</p>
        </details>

        <details className={sectionClassName}>
          <summary className="cursor-pointer font-medium text-slate-900">{t("dashboard:runnerReleases.admin.signingGuide.section.github")}</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("dashboard:runnerReleases.admin.signingGuide.githubBody")}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
            <li>{t("dashboard:runnerReleases.admin.signingGuide.githubStepOne")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.githubStepTwo")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.githubStepThree")}</li>
          </ol>
          <pre className={codeClassName}><code>{t("dashboard:runnerReleases.admin.signingGuide.githubCommand")}</code></pre>
          <p className="mt-2 text-xs leading-5 text-slate-500">{t("dashboard:runnerReleases.admin.signingGuide.githubNote")}</p>
        </details>

        <details className={sectionClassName}>
          <summary className="cursor-pointer font-medium text-slate-900">{t("dashboard:runnerReleases.admin.signingGuide.section.windows")}</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("dashboard:runnerReleases.admin.signingGuide.windowsBody")}</p>
          <pre className={codeClassName}><code>{t("dashboard:runnerReleases.admin.signingGuide.windowsCommand")}</code></pre>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-slate-500">
            <li>{t("dashboard:runnerReleases.admin.signingGuide.windowsStepOne")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.windowsStepTwo")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.windowsStepThree")}</li>
          </ul>
        </details>

        <details className={sectionClassName}>
          <summary className="cursor-pointer font-medium text-slate-900">{t("dashboard:runnerReleases.admin.signingGuide.section.publish")}</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("dashboard:runnerReleases.admin.signingGuide.publishBody")}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
            <li>{t("dashboard:runnerReleases.admin.signingGuide.publishStepOne")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.publishStepTwo")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.publishStepThree")}</li>
          </ol>
        </details>

        <details className={sectionClassName}>
          <summary className="cursor-pointer font-medium text-slate-900">{t("dashboard:runnerReleases.admin.signingGuide.section.verify")}</summary>
          <p className="mt-3 text-sm leading-6 text-slate-600">{t("dashboard:runnerReleases.admin.signingGuide.verifyBody")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
            <li>{t("dashboard:runnerReleases.admin.signingGuide.verifyStepOne")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.verifyStepTwo")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.verifyStepThree")}</li>
          </ul>
        </details>

        <details className={sectionClassName}>
          <summary className="cursor-pointer font-medium text-slate-900">{t("dashboard:runnerReleases.admin.signingGuide.section.troubleshoot")}</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>{t("dashboard:runnerReleases.admin.signingGuide.troubleshootMissing")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.troubleshootRequired")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.troubleshootMismatch")}</li>
            <li>{t("dashboard:runnerReleases.admin.signingGuide.troubleshootRotate")}</li>
          </ul>
        </details>
      </section>
    </section>
  );
}

export function RunnerReleaseAdminPanel() {
  const { t } = useScopedTranslation(["dashboard"]);
  const { data: releaseConfig, isLoading: isReleaseConfigLoading } =
    trpc.systemSettings.getDesktopReleaseSettings.useQuery();
  const [version, setVersion] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [ref, setRef] = useState("main");
  const [platform, setPlatform] = useState("all");
  const [profile, setProfile] = useState("all");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [publish, setPublish] = useState(true);
  const [build, setBuild] = useState<BuildStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const githubReleaseReady = Boolean(
    releaseConfig?.githubRepository?.trim() &&
      releaseConfig?.githubTokenConfigured
  );

  useEffect(() => {
    if (!build || ["completed", "failed"].includes(build.status)) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void fetch(`/api/runner-releases/admin/builds/${encodeURIComponent(build.id)}`, { credentials: "include", cache: "no-store", signal: controller.signal })
        .then(response => response.json())
        .then(payload => { if (!controller.signal.aborted && payload?.id) setBuild(payload as BuildStatus); })
        .catch(() => undefined);
    }, 4_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [build]);

  useEffect(() => {
    if (!build || !build.publish || build.status !== "completed" || build.syncStatus !== "idle" || busy) return;
    void syncRelease();
    // Sync is intentionally triggered once: the returned build state changes
    // syncStatus to completed or failed and closes this branch.
  }, [build, busy]);

  async function startBuild() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/runner-releases/admin/builds", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, releaseId: releaseId || version, ref, platform, profile, releaseNotes, publish, signingMode: "required-secret" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "runner_release_build_failed");
      setBuild(payload as BuildStatus);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "runner_release_build_failed");
    } finally {
      setBusy(false);
    }
  }

  async function syncRelease() {
    if (!build) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/runner-releases/admin/builds/${encodeURIComponent(build.id)}/sync`, { method: "POST", credentials: "include" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "runner_release_sync_failed");
      setBuild(payload as BuildStatus);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "runner_release_sync_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5" aria-labelledby="runner-admin-release-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-700">{t("dashboard:runnerReleases.admin.eyebrow")}</p>
          <h2 id="runner-admin-release-heading" className="mt-1 text-xl font-semibold text-slate-900">{t("dashboard:runnerReleases.admin.title")}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{t("dashboard:runnerReleases.admin.description")}</p>
        </div>
        <Badge variant="outline" className="w-fit border-indigo-200 bg-white text-indigo-700">{t("dashboard:runnerReleases.admin.only")}</Badge>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1.5 text-sm text-slate-700"><span>{t("dashboard:runnerReleases.admin.version")}</span><Input value={version} onChange={event => setVersion(event.target.value)} placeholder="0.2.0" /></label>
        <label className="space-y-1.5 text-sm text-slate-700"><span>{t("dashboard:runnerReleases.admin.releaseId")}</span><Input value={releaseId} onChange={event => setReleaseId(event.target.value)} placeholder="0.2.0" /></label>
        <label className="space-y-1.5 text-sm text-slate-700"><span>{t("dashboard:runnerReleases.admin.ref")}</span><Input value={ref} onChange={event => setRef(event.target.value)} /></label>
        <label className="space-y-1.5 text-sm text-slate-700"><span>{t("dashboard:runnerReleases.admin.notes")}</span><Input value={releaseNotes} onChange={event => setReleaseNotes(event.target.value)} placeholder={t("dashboard:runnerReleases.admin.notesPlaceholder")} /></label>
        <label className="space-y-1.5 text-sm text-slate-700"><span>{t("dashboard:runnerReleases.admin.targets")}</span><Select value={platform} onValueChange={setPlatform}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("dashboard:runnerReleases.admin.allPlatforms")}</SelectItem><SelectItem value="windows">Windows</SelectItem><SelectItem value="macos-intel">macOS Intel (x64)</SelectItem><SelectItem value="macos-arm64">macOS arm64 (Apple Silicon)</SelectItem><SelectItem value="linux">Linux</SelectItem></SelectContent></Select></label>
        <label className="space-y-1.5 text-sm text-slate-700"><span>{t("dashboard:runnerReleases.admin.profile")}</span><Select value={profile} onValueChange={setProfile}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("dashboard:runnerReleases.admin.localAndContainer")}</SelectItem><SelectItem value="local_device">{t("dashboard:runnerReleases.admin.localDevice")}</SelectItem><SelectItem value="shared_container">{t("dashboard:runnerReleases.admin.sharedContainer")}</SelectItem></SelectContent></Select></label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={publish} onChange={event => setPublish(event.target.checked)} /> <span>{t("dashboard:runnerReleases.admin.publishToCatalog")}</span></label>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void startBuild()} disabled={busy || !version.trim() || isReleaseConfigLoading || !githubReleaseReady}><Play className="mr-2 h-4 w-4" /> {t("dashboard:runnerReleases.admin.startBuild")}</Button>
        {build?.status === "completed" && build.publish && <Button type="button" variant="outline" onClick={() => void syncRelease()} disabled={busy}><RefreshCw className="mr-2 h-4 w-4" /> {t("dashboard:runnerReleases.admin.syncAssets")}</Button>}
        {busy && <Loader2 className="h-4 w-4 animate-spin text-indigo-700" aria-label={t("dashboard:runnerReleases.admin.working")} />}
      </div>
      {!isReleaseConfigLoading && !githubReleaseReady && <p className="mt-3 text-sm text-amber-800" role="status">{t("dashboard:runnerReleases.admin.configurationRequired")}</p>}
      {build && <p className="mt-4 rounded-xl border border-indigo-100 bg-white p-3 text-sm text-slate-700" aria-live="polite">{t("dashboard:runnerReleases.admin.buildStatus", { releaseId: build.releaseId })}: <span className="font-medium">{build.status}</span> · {build.publish ? `${t("dashboard:runnerReleases.admin.catalogSync")}: ${build.syncStatus}` : t("dashboard:runnerReleases.admin.artifactOnly")}{build.workflowRunUrl && <a className="ml-2 text-indigo-700 underline" href={build.workflowRunUrl} target="_blank" rel="noreferrer">{t("dashboard:runnerReleases.admin.buildDetails")}</a>}</p>}
      {error && <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p>}
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> {t("dashboard:runnerReleases.admin.securityNote")}</p>
      <RunnerSigningGuide t={t} />
    </section>
  );
}
