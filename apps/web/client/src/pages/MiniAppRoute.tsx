import { lazy } from "react";
import { useRoute } from "wouter";
import { AppPage } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";

const ResearchNotesPage = lazy(() => import("@/pages/ResearchNotesPage"));
const ProjectWikiPagesPage = lazy(() => import("@/pages/ProjectWikiPagesPage"));

export default function MiniAppRoute() {
  const [, params] = useRoute("/apps/:publicAppId");
  const publicAppId = params?.publicAppId ?? "";
  const appQuery = trpc.appIdentity.resolvePublicApp.useQuery({ publicAppId }, { enabled: Boolean(publicAppId), retry: false });

  if (appQuery.isLoading) return <AppPage title="Mini App" state="loading" />;
  if (appQuery.isError || !appQuery.data) {
    return <AppPage title="Mini App unavailable" state="error" error={{ title: "This App is unavailable", description: "Check the app link and your tenant access, then try again.", onRetry: () => { void appQuery.refetch(); } }} />;
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
