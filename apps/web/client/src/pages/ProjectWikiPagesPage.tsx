import { useMemo, useState } from "react";
import { AppPage } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";

type WikiProject = { projectId: string; title: string };
type WikiPage = { pageId: string; path: string; title: string; content: string; contentHash: string };

export default function ProjectWikiPagesPage({ appId }: { appId: "app_project_wiki_pages" }) {
  const utils = trpc.useUtils();
  const projectsQuery = trpc.projectWikiPages.listProjects.useQuery({ appId }, { enabled: Boolean(appId) });
  const projects = (projectsQuery.data ?? []) as WikiProject[];
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const projectId = projects.some((project) => project.projectId === selectedProjectId)
    ? selectedProjectId
    : projects[0]?.projectId ?? "";
  const pagesQuery = trpc.projectWikiPages.listPages.useQuery({ appId, projectId }, { enabled: Boolean(appId && projectId) });
  const pages = (pagesQuery.data ?? []) as WikiPage[];
  const [selectedPageId, setSelectedPageId] = useState("");
  const selectedPage = pages.find((page) => page.pageId === selectedPageId) ?? null;
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState("");

  const projectOptions = useMemo(() => projects.map((project) => ({ value: project.projectId, label: project.title })), [projects]);
  const refreshPages = () => utils.projectWikiPages.listPages.invalidate({ appId, projectId });
  const createPage = trpc.projectWikiPages.createPage.useMutation({
    onSuccess: async (page: WikiPage) => {
      setSelectedPageId(page.pageId);
      setTitle(page.title);
      setPath(page.path);
      setContent(page.content);
      setError("");
      await refreshPages();
    },
    onError: (cause) => setError(cause.message),
  });
  const updatePage = trpc.projectWikiPages.updatePage.useMutation({
    onSuccess: async (page: WikiPage) => {
      setError("");
      await refreshPages();
      setSelectedPageId(page.pageId);
    },
    onError: (cause) => setError(cause.message),
  });
  const archivePage = trpc.projectWikiPages.archivePage.useMutation({
    onSuccess: async () => {
      setSelectedPageId("");
      setTitle("");
      setPath("");
      setContent("");
      setArchiveTarget("");
      await refreshPages();
    },
    onError: (cause) => setError(cause.message),
  });

  function selectPage(page: WikiPage) {
    setSelectedPageId(page.pageId);
    setTitle(page.title);
    setPath(page.path);
    setContent(page.content);
    setArchiveTarget("");
    setError("");
  }

  function startNewPage() {
    setSelectedPageId("");
    setTitle("");
    setPath("");
    setContent("");
    setArchiveTarget("");
    setError("");
  }

  function savePage() {
    if (!projectId || !title.trim() || !path.trim()) return;
    setError("");
    if (selectedPage) updatePage.mutate({ appId, projectId, pageId: selectedPage.pageId, title, path, content });
    else createPage.mutate({ appId, projectId, title, path, content });
  }

  const state = projectsQuery.isLoading
    ? "loading"
    : projectsQuery.isError || (Boolean(projectId) && pagesQuery.isError)
      ? "error"
      : projects.length === 0
        ? "empty"
        : "ready";

  return (
    <AppPage
      title="Project Wiki Pages"
      description="Keep durable project guidance in editable, source-preserving pages."
      state={state}
      error={{
        title: "Project pages are unavailable",
        description: "Check your project access and app binding, then try again.",
        onRetry: () => { void projectsQuery.refetch(); void pagesQuery.refetch(); },
      }}
      empty={{
        title: "No project is connected to this app",
        description: "Ask a project owner to bind this Mini App to a project where you have access.",
      }}
      actions={projectId ? <Button label="New page" variant="primary" onClick={startNewPage} /> : undefined}
    >
      <VStack gap={5}>
        <HStack gap={3} align="end" wrap="wrap">
          <Selector
            label="Project"
            value={projectId}
            options={projectOptions}
            onChange={(value) => {
              setSelectedProjectId(value);
              setSelectedPageId("");
              setTitle("");
              setPath("");
              setContent("");
              setArchiveTarget("");
            }}
            hasSearch={projects.length > 5}
            width="100%"
          />
        </HStack>

        <Grid columns={{ minWidth: 280, max: 2 }} gap={5}>
          <VStack gap={3}>
            <HStack justify="between" align="center">
              <Text weight="semibold">Pages</Text>
              <Button label="New" variant="ghost" onClick={startNewPage} />
            </HStack>
            <Divider />
            {pagesQuery.isLoading ? <Text type="supporting">Loading pages…</Text> : null}
            {!pagesQuery.isLoading && pages.length === 0 ? (
              <Card padding={4}>
                <VStack gap={2}>
                  <Text weight="semibold">No pages yet</Text>
                  <Text type="supporting">Create a page for project setup, decisions, or team guidance.</Text>
                  <Button label="Create first page" variant="secondary" onClick={startNewPage} />
                </VStack>
              </Card>
            ) : null}
            {pages.length > 0 ? (
              <List header="Project pages" hasDividers density="compact">
                {pages.map((page) => (
                  <ListItem
                    key={page.pageId}
                    label={page.title}
                    description={`/${page.path}`}
                    onClick={() => selectPage(page)}
                    isSelected={selectedPage?.pageId === page.pageId}
                  />
                ))}
              </List>
            ) : null}
          </VStack>

          <VStack gap={3}>
            <HStack justify="between" align="center" wrap="wrap">
              <Text weight="semibold">{selectedPage ? "Edit page" : "New page"}</Text>
              {selectedPage ? <Button label="Archive page" variant="secondary" onClick={() => setArchiveTarget(selectedPage.pageId)} /> : null}
            </HStack>
            <Divider />
            {archiveTarget ? (
              <Card padding={3}>
                <VStack gap={2}>
                  <Text>Archive “{selectedPage?.title}”? It will no longer appear in the active page list.</Text>
                  <HStack gap={2}>
                    <Button label="Confirm archive" variant="destructive" isLoading={archivePage.isPending} onClick={() => archivePage.mutate({ appId, projectId, pageId: archiveTarget })} />
                    <Button label="Cancel" variant="secondary" onClick={() => setArchiveTarget("")} />
                  </HStack>
                </VStack>
              </Card>
            ) : null}
            <TextInput label="Page title" value={title} onChange={(value) => setTitle(value)} isRequired />
            <TextInput label="Page path" value={path} onChange={(value) => setPath(value)} description="Use lowercase words and hyphens, for example onboarding/start-here." isRequired />
            <TextArea label="Page content" value={content} onChange={(value) => setContent(value)} maxLength={262_144} rows={12} />
            {selectedPage ? <Text type="supporting">Saved content SHA-256: {selectedPage.contentHash}</Text> : null}
            {error ? <Text color="accent">{error}</Text> : null}
            <HStack gap={2}>
              <Button label={selectedPage ? "Save changes" : "Create page"} variant="primary" isLoading={createPage.isPending || updatePage.isPending} isDisabled={!projectId || !title.trim() || !path.trim()} onClick={savePage} />
              {selectedPage ? <Button label="Cancel edits" variant="secondary" onClick={() => selectPage(selectedPage)} /> : null}
            </HStack>
          </VStack>
        </Grid>
      </VStack>
    </AppPage>
  );
}
