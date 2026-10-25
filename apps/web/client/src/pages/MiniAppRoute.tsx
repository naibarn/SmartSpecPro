import { lazy, useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { AppButton, AppPage, Heading, HStack, ProgressBar, Section, Tab, TabList, Text, TextArea, VStack } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";

const ResearchNotesPage = lazy(() => import("@/pages/ResearchNotesPage"));
const ProjectWikiPagesPage = lazy(() => import("@/pages/ProjectWikiPagesPage"));
type ProjectTab = "preview" | "progress" | "files" | "builds";

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
      <VStack gap={3}>
        <TextArea
          label="Continue development"
          description="Add a feature or describe a change. This continues the same App Home."
          value={prompt}
          maxLength={4_000}
          onChange={value => setPrompt(value)}
          isDisabled={continuation.isPending}
        />
        {continuation.error ? <Text type="body" color="secondary" role="alert">{continuation.error.message}</Text> : null}
        {continuation.isSuccess ? <Text type="body" color="secondary" role="status">Continuation started for this App Home.</Text> : null}
        <HStack>
          <AppButton type="submit" label={continuation.isPending ? "Starting…" : "Continue Development"} variant="primary" isDisabled={!prompt.trim() || continuation.isPending} />
        </HStack>
      </VStack>
    </form>
  );
}

function MiniAppHome({ appId, app, data, onChanged }: {
  appId: string;
  app: NonNullable<ReturnType<typeof trpc.appIdentity.resolveMiniApp.useQuery>["data"]>["app"];
  data: NonNullable<ReturnType<typeof trpc.appIdentity.resolveMiniApp.useQuery>["data"]>;
  onChanged: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [tab, setTab] = useState<ProjectTab>(data.html ? "preview" : "progress");
  const factory = data.factory;
  const retry = trpc.spec226DevelopmentControl.retryMiniAppFactoryStage.useMutation({ onSuccess: onChanged });
  const stages = [...new Set([...(factory?.completedStages ?? []), ...(factory?.remainingStages ?? [])])];
  const progress = stages.length ? Math.round(((factory?.completedStages?.length ?? 0) / stages.length) * 100) : 0;
  const title = factory?.goal
    ? factory.goal.trim().split(/[.!?\n]/, 1)[0]!
        .replace(/^\s*(?:please\s+)?(?:create|build|make|design|generate)\s+/i, "")
        .split(/\b(?:with|including|that|which)\b/i, 1)[0]!
        .replace(/^\s*(?:a|an|the)\s+/i, "")
        .trim()
    : app?.appId ?? appId;
  const active = Boolean(factory?.isInProgress);
  const previewAvailable = Boolean(app?.lastKnownGoodArtifactRef && data.html);
  const artifactRefs = factory?.artifacts?.filter((value: string) => /^(?:app-source|app-artifact|app-candidate|package-digest|app-repository):/.test(value)) ?? [];

  useEffect(() => {
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
  }, [appId]);

  return (
    <AppPage
      title={title || app?.appId || appId}
      description={`Private Mini-App · ${appId}`}
      actions={(
        <HStack wrap="wrap" gap={2}>
          {factory?.retryable ? (
            <AppButton
              label={retry.isPending ? "Repairing…" : "Retry / Repair"}
              variant="primary"
              isDisabled={retry.isPending || active}
              onClick={() => retry.mutate({ appId })}
            />
          ) : null}
        </HStack>
      )}
    >
      <VStack gap={4}>
        <Section>
          <VStack gap={3}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <Heading level={2}>{factory?.milestone === "BUILDING" && previewAvailable ? "PREVIEW_AVAILABLE" : factory?.milestone ?? (previewAvailable ? "PREVIEW_AVAILABLE" : "BUILDING")}</Heading>
              <Text type="body" color="secondary">{factory?.jobState ?? "Preparing your private app"}{factory?.currentStage ? ` · ${factory.currentStage}` : ""}</Text>
            </HStack>
            <ProgressBar label="Mini-App build progress" value={progress} max={100} hasValueLabel />
            {factory?.latestStageUpdatedAt ? <Text type="body" color="secondary">Last job update: {new Date(factory.latestStageUpdatedAt).toLocaleString()}</Text> : null}
            {factory?.remainingStages?.length ? <Text type="body" color="secondary">Next stages: {factory.remainingStages.join(" → ")}</Text> : null}
            {factory?.error ? <Text type="body" color="secondary" role="alert">{factory.error.message || factory.error.code}</Text> : null}
            {retry.error ? <Text type="body" color="secondary" role="alert">Repair could not start: {retry.error.message}</Text> : null}
            {retry.isSuccess ? <Text type="body" color="secondary" role="status">Repair was queued on the existing DevelopmentRun.</Text> : null}
          </VStack>
        </Section>

        <TabList value={tab} onChange={value => setTab(value as ProjectTab)} role="tablist" layout="fill" hasDivider>
          <Tab value="preview" label="Preview" panelId="miniapp-panel-preview" />
          <Tab value="progress" label="Progress" panelId="miniapp-panel-progress" />
          <Tab value="files" label="Files" panelId="miniapp-panel-files" />
          <Tab value="builds" label="Builds" panelId="miniapp-panel-builds" />
        </TabList>

        {tab === "preview" ? (
          <Section>
            {previewAvailable && data.html ? (
              <iframe
                ref={frameRef}
                title={`${title} preview`}
                srcDoc={data.html}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                data-testid="miniapp-preview-frame"
                style={{ display: "block", width: "100%", height: "min(78vh, 900px)", border: 0 }}
              />
            ) : (
              <VStack gap={2}>
                <Heading level={3}>Preview is not available yet</Heading>
                <Text type="body" color="secondary">{factory?.sourceSnapshotRef ? "A source snapshot is saved. The preview will appear after a successful build." : "Generation failed before a source snapshot was created."}</Text>
              </VStack>
            )}
          </Section>
        ) : null}

        {tab === "progress" ? (
          <Section>
            <VStack gap={3}>
              <Heading level={3}>Development progress</Heading>
              {factory?.sourceSnapshotRef ? <Text type="body">Source snapshot saved · SHA-256 {factory.appSourceDigest ?? "available"}</Text> : <Text type="body" color="secondary">Generation failed before a source snapshot was created.</Text>}
              {factory?.currentStage && factory?.jobState === "failed" ? <Text type="body" color="secondary">Failed at {factory.currentStage}. {factory.retryable ? "Retry / Repair will resume this stage on the same run." : "This stage is not currently retryable."}</Text> : null}
              {factory?.repository?.url ? <Text type="body">Repository: <a href={factory.repository.url} target="_blank" rel="noreferrer">{factory.repository.owner}/{factory.repository.name}</a></Text> : <Text type="body" color="secondary">Repository: {factory?.repositoryState ?? "Not provisioned yet"}</Text>}
              {factory?.repositoryState === "AUTH_REQUIRED" ? <Text type="body" color="secondary">Source and preview remain in this private App Home. Connect GitHub in Settings → Integrations to provision a dedicated repository.</Text> : null}
              {factory?.conversationId ? <ContinueMiniApp input={{ appId, conversationId: factory.conversationId }} onStarted={onChanged} /> : null}
            </VStack>
          </Section>
        ) : null}

        {tab === "files" ? (
          <Section>
            <VStack gap={2}>
              <Heading level={3}>Saved files and artifacts</Heading>
              {artifactRefs.length ? artifactRefs.map((ref: string, index: number) => <Text key={`${ref}-${index}`} type="body">{ref}</Text>) : <Text type="body" color="secondary">No source snapshot or build artifact has been saved yet.</Text>}
              {data.artifactDigest ? <Text type="body">Preview SHA-256: {data.artifactDigest}</Text> : null}
            </VStack>
          </Section>
        ) : null}

        {tab === "builds" ? (
          <Section>
            <VStack gap={2}>
              <Heading level={3}>Build history</Heading>
              {factory?.completedStages?.length ? <ol>{factory.completedStages.map((stage: string) => <li key={stage}>{stage} · complete</li>)}</ol> : <Text type="body" color="secondary">No stages completed yet.</Text>}
              {factory?.currentStage ? <Text type="body">Latest attempt: {factory.currentStage} · {factory.jobState}</Text> : null}
              {factory?.latestStageJobId ? <Text type="body" color="secondary">Job ID: {factory.latestStageJobId}</Text> : null}
              {factory?.error ? <Text type="body" color="secondary">Error: {factory.error.message || factory.error.code}</Text> : null}
            </VStack>
          </Section>
        ) : null}
      </VStack>
    </AppPage>
  );
}

export default function MiniAppRoute() {
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

  if (appQuery.isLoading) return <AppPage title="Mini App" state="loading" />;
  if (appQuery.isError || !appQuery.data) {
    return <AppPage title="Mini App unavailable" state="error" error={{ title: "This App is unavailable", description: "Check the app link and your tenant access, then try again.", onRetry: () => { void appQuery.refetch(); } }} />;
  }
  if (isMiniAppRoute) {
    const miniAppData = miniAppQuery.data;
    if (!miniAppData) return <AppPage title="Mini App unavailable" state="error" />;
    return <MiniAppHome appId={appId} app={miniAppData.app} data={miniAppData} onChanged={() => { void miniAppQuery.refetch(); }} />;
  }
  if (appQuery.data.appId === "app_project_wiki_pages") return <ProjectWikiPagesPage appId={appQuery.data.appId} />;
  if (appQuery.data.appId === "app_research_notes") return <ResearchNotesPage />;
  return <AppPage title="Mini App unavailable" state="error" error={{ title: "This App is not supported yet", description: "The App link is valid, but this host does not have a runtime for it." }} />;
}
