import { lazy, useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { AppPage } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";

const ResearchNotesPage = lazy(() => import("@/pages/ResearchNotesPage"));
const ProjectWikiPagesPage = lazy(() => import("@/pages/ProjectWikiPagesPage"));

function ContinueMiniApp({ input, onStarted }: {
  input: { appId: string; conversationId: number };
  onStarted: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const continuation = trpc.spec226DevelopmentControl.startWorkspaceRun.useMutation({
    onSuccess: () => {
      setPrompt("");
      onStarted();
    },
  });
  return (
    <form onSubmit={event => {
      event.preventDefault();
      const feedback = prompt.trim();
      if (!feedback || continuation.isPending) return;
      continuation.mutate({
        conversationId: input.conversationId,
        mode: "prompt",
        factoryMode: true,
        appId: input.appId,
        prompt: feedback,
        idempotencyKey: `miniapp-feedback:${crypto.randomUUID()}`,
      });
    }}>
      <label htmlFor="miniapp-feedback">Continue this Mini App or send feedback</label>
      <textarea
        id="miniapp-feedback"
        value={prompt}
        maxLength={4_000}
        rows={4}
        onChange={event => setPrompt(event.target.value)}
      />
      {continuation.error ? <p role="alert">{continuation.error.message}</p> : null}
      <button type="submit" disabled={!prompt.trim() || continuation.isPending}>
        {continuation.isPending ? "Starting build…" : "Continue Mini App"}
      </button>
    </form>
  );
}

export default function MiniAppRoute() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [, miniAppParams] = useRoute("/miniapp/:appId");
  const [, legacyParams] = useRoute("/apps/:publicAppId");
  const appId = miniAppParams?.appId ?? "";
  const publicAppId = legacyParams?.publicAppId ?? "";
  const isMiniAppRoute = Boolean(appId);
  const miniAppQuery = trpc.appIdentity.resolveMiniApp.useQuery(
    { appId },
    {
      enabled: isMiniAppRoute,
      retry: false,
      refetchInterval: query => query.state.data?.factory?.isInProgress || (!query.state.data?.app?.lastKnownGoodArtifactRef && !query.state.data?.factory?.error) ? 2_000 : false,
    },
  );
  const legacyQuery = trpc.appIdentity.resolvePublicApp.useQuery({ publicAppId }, { enabled: !isMiniAppRoute && Boolean(publicAppId), retry: false });
  const appQuery = isMiniAppRoute ? miniAppQuery : legacyQuery;

  useEffect(() => {
    if (!isMiniAppRoute || !appId) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = event.data as Record<string, unknown> | null;
      if (!message || message.channel !== "smartaihub-miniapp-storage-v1" ||
        !["GET", "SET"].includes(String(message.action)) || typeof message.requestId !== "string" ||
        message.requestId.length > 32 || typeof message.key !== "string" || !/^[A-Za-z0-9_.:-]{1,100}$/.test(message.key)) return;
      const storageKey = `smartaihub:miniapp:${appId}:${message.key}`;
      let value: unknown;
      let error: string | undefined;
      try {
        if (message.action === "GET") {
          const stored = window.localStorage.getItem(storageKey);
          value = stored === null ? null : JSON.parse(stored);
        } else {
          const encoded = JSON.stringify(message.value);
          if (encoded === undefined || encoded.length > 65_536) throw new Error("value too large");
          window.localStorage.setItem(storageKey, encoded);
          value = true;
        }
      } catch {
        error = "storage unavailable";
      }
      frameRef.current?.contentWindow?.postMessage({
        channel: "smartaihub-miniapp-storage-result-v1",
        requestId: message.requestId,
        ...(error ? { error } : { value }),
      }, "*");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [appId, isMiniAppRoute]);

  if (appQuery.isLoading) return <AppPage title="Mini App" state="loading" />;
  if (appQuery.isError || !appQuery.data) {
    return <AppPage title="Mini App unavailable" state="error" error={{ title: "This App is unavailable", description: "Check the app link and your tenant access, then try again.", onRetry: () => { void appQuery.refetch(); } }} />;
  }
  if (isMiniAppRoute) {
    const miniAppData = miniAppQuery.data;
    if (!miniAppData) return <AppPage title="Mini App unavailable" state="error" />;
    const app = miniAppData.app;
    const factory = miniAppData.factory;
    const previewAvailable = Boolean(app?.lastKnownGoodArtifactRef && miniAppData.html);
    if (previewAvailable && miniAppData.html) {
      return (
        <AppPage title={app?.appId ?? appId} description={factory?.goal || `/miniapp/${appId}`}>
          <section aria-label="Mini App project home" data-testid="miniapp-project-home">
            <h2>{factory?.milestone ?? "PREVIEW_AVAILABLE"}</h2>
            {factory ? <p>Job: {factory.jobState ?? "unknown"}{factory.currentStage ? ` · Stage: ${factory.currentStage}` : ""}</p> : null}
            {factory?.repository?.url ? <p>Source repository: <a href={factory.repository.url} target="_blank" rel="noreferrer">{factory.repository.owner}/{factory.repository.name}</a></p> : factory ? <p>Source repository: {factory.repositoryState ?? "PROVISIONING_PENDING"}</p> : null}
            {factory?.repositoryState === "AUTH_REQUIRED" ? <p role="status">Source snapshot and preview stay available. Connect GitHub in Settings → Integrations, or configure SMARTAIHUB_MINIAPP_GITHUB_TOKEN once for managed repositories.</p> : null}
            {factory?.sourceSnapshotRef ? <p>Source snapshot: {factory.appSourceDigest ?? "saved"}</p> : null}
            {miniAppData.artifactDigest ? <p>Preview artifact SHA-256: {miniAppData.artifactDigest}</p> : null}
            {factory?.remainingStages?.length ? <p>Remaining stages: {factory.remainingStages.join(", ")}</p> : null}
            {factory?.error ? <p role="alert">Latest build attempt failed: {factory.error.message || factory.error.code}</p> : null}
            {factory?.completedStages?.length ? (
              <section aria-label="Build history">
                <h3>Build history</h3>
                <ol>{factory.completedStages.map((stage: string) => <li key={stage}>{stage}</li>)}</ol>
              </section>
            ) : null}
            {factory?.conversationId ? <ContinueMiniApp input={{ appId, conversationId: factory.conversationId }} onStarted={() => { void miniAppQuery.refetch(); }} /> : null}
            <iframe
              ref={frameRef}
              title={app?.appId ?? appId}
              srcDoc={miniAppData.html}
              sandbox="allow-scripts"
              referrerPolicy="no-referrer"
              data-testid="miniapp-preview-frame"
              style={{ display: "block", width: "100%", height: "82vh", border: 0 }}
            />
          </section>
        </AppPage>
      );
    }
    return (
      <AppPage title={app?.appId ?? appId} description={factory?.goal || `/miniapp/${appId}`}>
        <section aria-label="Mini App project home" data-testid="miniapp-project-home">
          <h2>{factory?.milestone ?? (app?.lastKnownGoodArtifactRef ? "PREVIEW_UNAVAILABLE" : "BUILDING")}</h2>
          <p>{factory ? `Job: ${factory.jobState ?? "unknown"}${factory.currentStage ? ` · Stage: ${factory.currentStage}` : ""}` : "Your private Mini App project is being prepared."}</p>
          {factory?.repository?.url ? <p>Source repository: <a href={factory.repository.url} target="_blank" rel="noreferrer">{factory.repository.owner}/{factory.repository.name}</a></p> : factory ? <p>Source repository: {factory.repositoryState ?? "PROVISIONING_PENDING"}</p> : null}
          {factory?.repositoryState === "AUTH_REQUIRED" ? <p role="status">Source snapshot stays available. Connect GitHub in Settings → Integrations, or configure SMARTAIHUB_MINIAPP_GITHUB_TOKEN once for managed repositories.</p> : null}
          {factory?.error ? <p role="alert">Latest build attempt failed: {factory.error.message || factory.error.code}</p> : null}
          {factory?.completedStages?.length ? (
            <section aria-label="Build history"><h3>Build history</h3><ol>{factory.completedStages.map((stage: string) => <li key={stage}>{stage}</li>)}</ol></section>
          ) : null}
          {factory?.sourceSnapshotRef ? <p>Source snapshot saved.</p> : null}
          {factory?.remainingStages?.length ? <p>Remaining stages: {factory.remainingStages.join(", ")}</p> : null}
          {factory?.conversationId ? <ContinueMiniApp input={{ appId, conversationId: factory.conversationId }} onStarted={() => { void miniAppQuery.refetch(); }} /> : null}
        </section>
      </AppPage>
    );
  }
  if (appQuery.data.appId === "app_project_wiki_pages") return <ProjectWikiPagesPage appId={appQuery.data.appId} />;
  if (appQuery.data.appId === "app_research_notes") return <ResearchNotesPage />;
  return (
    <AppPage
      title="Mini App unavailable"
      state="error"
      error={{
        title: "This App is not supported yet",
        description: "The App link is valid, but this host does not have a runtime for it.",
      }}
    />
  );
}
