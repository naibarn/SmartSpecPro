import { lazy, useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { AppButton, AppPage, Card, Collapsible, Grid, Heading, HStack, ProgressBar, Section, StatusDot, Tab, TabList, Text, TextArea, VStack } from "@/components/AppPage";
import { trpc } from "@/lib/trpc";

const ResearchNotesPage = lazy(() => import("@/pages/ResearchNotesPage"));
const ProjectWikiPagesPage = lazy(() => import("@/pages/ProjectWikiPagesPage"));
type ProjectTab = "preview" | "progress" | "files" | "builds";

const STAGE_LABELS: Record<string, string> = {
  ui_implementation: "Implement app interface",
  package: "Package app files",
  deploy: "Publish private preview",
  smoke: "Verify preview",
  source_repository: "Set up source repository",
};

function humanizeStage(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/[_-]+/g, " ").replace(/^\w/, value => value.toUpperCase());
}

function readableStatus(status?: string | null): string {
  const labels: Record<string, string> = {
    BUILDING: "Building",
    BUILD_FAILED: "Build needs attention",
    PREVIEW_AVAILABLE: "Preview available",
    queued: "Queued",
    retry_scheduled: "Retry scheduled",
    leased: "Worker starting",
    running: "In progress",
    waiting_external: "Waiting for provider",
    failed: "Failed",
    expired: "Timed out",
    orphaned: "Worker stopped; checking recovery",
    cancelled: "Cancelled",
    completed: "Completed",
  };
  return status ? (labels[status] ?? status.replace(/[_-]+/g, " ")) : "Preparing your private app";
}

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
  const stages = [...new Set([...(factory?.completedStages ?? []), ...(factory?.currentStage ? [factory.currentStage] : []), ...(factory?.remainingStages ?? [])])];
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
  const status = previewAvailable && !active ? "PREVIEW_AVAILABLE" : ["orphaned", "expired", "cancelled", "canceled"].includes(factory?.jobState ?? "") ? factory?.jobState : factory?.milestone ?? factory?.jobState ?? "BUILDING";
  const statusVariant = active ? "accent" : factory?.jobState === "failed" || factory?.jobState === "expired" ? "error" : previewAvailable ? "success" : "warning";
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
      description={`Private Mini-App · ${appId} · Version ${app?.deploymentVersion ?? 0}`}
      constrainToParent
      actions={(
        <HStack wrap="wrap" gap={2}>
          {previewAvailable ? <AppButton label="Open Preview" variant="secondary" onClick={() => setTab("preview")} /> : null}
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
      <VStack gap={4} className="min-w-0 w-full max-w-full">
        <Grid columns={{ minWidth: 240, max: 3 }} gap={3}>
          <Card padding={4} data-testid="miniapp-status-card">
            <VStack gap={2}>
              <Text type="label" color="secondary">App status</Text>
              <HStack align="center" gap={2}>
                <StatusDot variant={statusVariant} label={readableStatus(status)} isPulsing={active} />
                <Heading level={3}>{readableStatus(status)}</Heading>
              </HStack>
              <Text type="body" color="secondary">{factory?.currentStage ? humanizeStage(factory.currentStage) : previewAvailable ? `Private preview · version ${app?.deploymentVersion ?? 0}` : "Your App Home is saved and available while work continues."}</Text>
            </VStack>
          </Card>
          <Card padding={4} data-testid="miniapp-progress-card">
            <VStack gap={2}>
              <Text type="label" color="secondary">Build progress</Text>
              <ProgressBar label="Mini-App build progress" value={progress} max={100} hasValueLabel />
              <Text type="body" color="secondary">{factory?.completedStages?.length ?? 0} of {stages.length} stages complete</Text>
            </VStack>
          </Card>
          <Card padding={4} data-testid="miniapp-execution-card">
            <VStack gap={2}>
              <Text type="label" color="secondary">Execution</Text>
              <Text type="body">{readableStatus(factory?.jobState)}</Text>
              {factory?.latestStageJobId ? <Text type="body" color="secondary">Job · {factory.latestStageJobId}</Text> : <Text type="body" color="secondary">Waiting for the first worker job</Text>}
              {factory?.latestStageUpdatedAt ? <Text type="body" color="secondary">Updated {new Date(factory.latestStageUpdatedAt).toLocaleString()}</Text> : null}
            </VStack>
          </Card>
        </Grid>

        {factory?.error ? (
          <Section>
            <VStack gap={2}>
              <Heading level={3}>This build needs attention</Heading>
              <Text type="body" role="alert">{factory.error.message || "The app could not complete this stage. Your App Home and saved work are preserved."}</Text>
              <Collapsible trigger="Technical details" defaultIsOpen={false}>
                <VStack gap={1}>
                  <Text type="body">Code: {factory.error.code}</Text>
                  {factory.currentStage ? <Text type="body">Stage: {factory.currentStage}</Text> : null}
                  {factory.latestStageJobId ? <Text type="body">Job: {factory.latestStageJobId}</Text> : null}
                </VStack>
              </Collapsible>
              {retry.error ? <Text type="body" role="alert">Repair could not start: {retry.error.message}</Text> : null}
              {retry.isSuccess ? <Text type="body" role="status">Repair was queued on this App’s existing DevelopmentRun.</Text> : null}
            </VStack>
          </Section>
        ) : null}

        {!factory?.error && retry.error ? <Text type="body" role="alert">Repair could not start: {retry.error.message}</Text> : null}
        {retry.isSuccess && !factory?.error ? <Text type="body" role="status">Repair was queued on this App’s existing DevelopmentRun.</Text> : null}

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
                // Local app forms run inside the opaque sandbox; the artifact CSP
                // still blocks all form navigation with `form-action 'none'`.
                sandbox="allow-scripts allow-forms"
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
              <Heading level={2}>Development timeline</Heading>
              {stages.length ? <Grid columns={{ minWidth: 220, max: 4 }} gap={2}>
                {stages.map((stage: string) => {
                  const completed = factory?.completedStages?.includes(stage);
                  const current = factory?.currentStage === stage && !completed;
                  const failed = current && (factory?.jobState === "failed" || factory?.jobState === "expired");
                  const label = completed ? "Complete" : failed ? readableStatus(factory?.jobState) : current ? readableStatus(factory?.jobState) : "Queued";
                  return <Card key={stage} padding={3} variant={failed ? "red" : completed ? "green" : current ? "blue" : "muted"} data-testid={`miniapp-stage-${stage}`}>
                    <VStack gap={1}>
                      <Text type="label">{humanizeStage(stage)}</Text>
                      <Text type="body" color="secondary">{label}</Text>
                    </VStack>
                  </Card>;
                })}
              </Grid> : <Text type="body" color="secondary">The development plan will appear when the first run is recorded.</Text>}
              {factory?.sourceSnapshotRef ? <Text type="body">Source snapshot saved · SHA-256 {factory.appSourceDigest ?? "available"}</Text> : <Text type="body" color="secondary">Generation failed before a source snapshot was created.</Text>}
              {factory?.currentStage && (factory?.jobState === "failed" || factory?.jobState === "expired") ? <Text type="body" color="secondary">Stopped at {humanizeStage(factory.currentStage)}. {factory.retryable ? "Retry / Repair will resume this stage on the same run." : "This stage is not currently retryable."}</Text> : null}
              {factory?.repository?.url ? <Text type="body">Repository: <a href={factory.repository.url} target="_blank" rel="noreferrer">{factory.repository.owner}/{factory.repository.name}</a></Text> : <Text type="body" color="secondary">Repository: {factory?.repositoryState ?? "Not provisioned yet"}</Text>}
              {factory?.repositoryState === "AUTH_REQUIRED" ? <Text type="body" color="secondary">Source and preview remain in this private App Home. Connect GitHub in Settings → Integrations to provision a dedicated repository.</Text> : null}
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
              {factory?.completedStages?.length ? factory.completedStages.map((stage: string) => <Text key={stage} type="body">{humanizeStage(stage)} · complete</Text>) : <Text type="body" color="secondary">No stages completed yet.</Text>}
              {factory?.currentStage ? <Text type="body">Latest attempt: {humanizeStage(factory.currentStage)} · {readableStatus(factory.jobState)}</Text> : null}
              {factory?.latestStageJobId ? <Text type="body" color="secondary">Job ID: {factory.latestStageJobId}</Text> : null}
              {factory?.error ? <Text type="body" color="secondary">Error: {factory.error.code}</Text> : null}
            </VStack>
          </Section>
        ) : null}

        {factory?.conversationId ? <Section>
          <VStack gap={3}>
            <Heading level={2}>Continue development</Heading>
            <ContinueMiniApp input={{ appId, conversationId: factory.conversationId }} onStarted={onChanged} />
          </VStack>
        </Section> : null}
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
      refetchInterval: query => {
        const factory = query.state.data?.factory;
        if (factory?.recoveryNeeded) return 5_000;
        if (factory?.isInProgress) return 2_000;
        const terminal = ["failed", "expired", "cancelled", "canceled"].includes(factory?.jobState ?? "");
        return !terminal && !query.state.data?.app?.lastKnownGoodArtifactRef && !factory?.error ? 2_000 : false;
      },
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
