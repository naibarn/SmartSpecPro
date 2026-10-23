import { lazy } from "react";
import { useRoute } from "wouter";
import { AppPage } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";

const ResearchNotesPage = lazy(() => import("@/pages/ResearchNotesPage"));
const ProjectWikiPagesPage = lazy(() => import("@/pages/ProjectWikiPagesPage"));

export default function MiniAppRoute() {
  const [, miniAppParams] = useRoute("/miniapp/:appId");
  const [, legacyParams] = useRoute("/apps/:publicAppId");
  const appId = miniAppParams?.appId ?? "";
  const publicAppId = legacyParams?.publicAppId ?? "";
  const isMiniAppRoute = Boolean(appId);
  const miniAppQuery = trpc.appIdentity.resolveMiniApp.useQuery({ appId }, { enabled: isMiniAppRoute, retry: false });
  const legacyQuery = trpc.appIdentity.resolvePublicApp.useQuery({ publicAppId }, { enabled: !isMiniAppRoute && Boolean(publicAppId), retry: false });
  const appQuery = isMiniAppRoute ? miniAppQuery : legacyQuery;

  if (appQuery.isLoading) return <AppPage title="Mini App" state="loading" />;
  if (appQuery.isError || !appQuery.data) {
    return <AppPage title="Mini App unavailable" state="error" error={{ title: "This App is unavailable", description: "Check the app link and your tenant access, then try again.", onRetry: () => { void appQuery.refetch(); } }} />;
  }
  if (isMiniAppRoute) {
    const miniAppData = miniAppQuery.data;
    if (!miniAppData) return <AppPage title="Mini App unavailable" state="error" />;
    const previewAvailable = Boolean(miniAppData.lastKnownGoodArtifactRef);
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
