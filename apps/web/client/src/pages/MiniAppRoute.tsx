import { lazy, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { AppPage } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";

const ResearchNotesPage = lazy(() => import("@/pages/ResearchNotesPage"));
const ProjectWikiPagesPage = lazy(() => import("@/pages/ProjectWikiPagesPage"));

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
      refetchInterval: query => query.state.data?.lastKnownGoodArtifactRef ? false : 2_000,
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
    const previewAvailable = Boolean(miniAppData.lastKnownGoodArtifactRef && "html" in miniAppData && miniAppData.html);
    if (previewAvailable && "html" in miniAppData && miniAppData.html) {
      return (
        <AppPage title={miniAppData.appId} description={`/miniapp/${miniAppData.appId}`}>
          <iframe
            ref={frameRef}
            title={miniAppData.appId}
            srcDoc={miniAppData.html}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            data-testid="miniapp-preview-frame"
            style={{ display: "block", width: "100%", height: "82vh", border: 0 }}
          />
        </AppPage>
      );
    }
    if (miniAppData.lastKnownGoodArtifactRef) {
      return <AppPage title="Mini App preview unavailable" state="error" error={{ title: "The saved preview could not be loaded", description: "The last-known-good build is retained. Reload to try again." }} />;
    }
    return (
      <AppPage
        title="Mini App"
        description={`/miniapp/${miniAppData.appId}`}
        state="empty"
        empty={{
          title: previewAvailable ? "Preview runtime unavailable" : "BUILDING",
          description: previewAvailable
            ? "A last-known-good artifact is retained, but the preview delivery runtime is not yet connected."
            : "No runnable artifact is available yet. The Mini App will appear here after its build and deployment complete.",
        }}
      />
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
