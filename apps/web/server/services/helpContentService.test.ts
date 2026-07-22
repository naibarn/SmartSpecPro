import { beforeEach, describe, expect, it } from "vitest";
import {
  getContextualHelpTopics,
  getHelpSearchIndex,
  getHelpTopic,
  resetHelpContentCachesForTests,
} from "./helpContentService";
import { buildHelpContext } from "./helpContextInjector";

describe("helpContentService", () => {
  beforeEach(() => {
    resetHelpContentCachesForTests();
  });

  it("loads the full application help docs instead of the sparse repo-root fallback", async () => {
    const index = await getHelpSearchIndex("en");

    expect(index.length).toBeGreaterThan(20);
    expect(index.some(topic => topic.slug === "browser-session")).toBe(true);
    expect(index.some(topic => topic.slug === "local-ai")).toBe(true);
  });

  it("keeps English and Thai help topic coverage in sync", async () => {
    const [enIndex, thIndex] = await Promise.all([
      getHelpSearchIndex("en"),
      getHelpSearchIndex("th"),
    ]);

    const enSlugs = enIndex.map((topic) => topic.slug).sort();
    const thSlugs = thIndex.map((topic) => topic.slug).sort();

    expect(enSlugs).toEqual(thSlugs);
    expect(enIndex.length).toBe(thIndex.length);
  });

  it("returns the local-ai topic in Thai", async () => {
    const topic = await getHelpTopic("local-ai", "th");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("Local AI");
    expect(topic?.html).toContain("Settings &gt; Local AI");
  });

  it("loads the Hermes worker guide and keeps the runtime positioning explicit", async () => {
    const topic = await getHelpTopic("hermes-workers", "en");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("Hermes");
    expect(topic?.html).toContain("hermesAgentRuntime");
    expect(topic?.html).toContain("OpenClaw");
    expect(topic?.html).toContain("Desktop Host");
    expect(topic?.html).toContain("audited exception");
    expect(topic?.html).toContain("https");
  });

  it("loads the Hermes worker guide in Thai and keeps the rollout and security notes visible", async () => {
    const topic = await getHelpTopic("hermes-workers", "th");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("Hermes");
    expect(topic?.html).toContain("hermesAgentRuntime");
    expect(topic?.html).toContain("OpenClaw");
    expect(topic?.html).toContain("https");
  });

  it.each([
    ["grok-via-hermes-connections", "/settings"],
    ["grok-via-hermes-admin", "/admin/settings"],
    ["grok-via-hermes-worker-app", "/workers/connect"],
    ["grok-via-hermes-monitoring", "/admin/monitoring"],
  ])("loads bilingual Grok via Hermes help for %s", async (slug, page) => {
    const [english, thai, contextual] = await Promise.all([
      getHelpTopic(slug, "en"),
      getHelpTopic(slug, "th"),
      getContextualHelpTopics(page, "en"),
    ]);

    expect(english).not.toBeNull();
    expect(thai).not.toBeNull();
    expect(english?.html).toContain("Hermes");
    expect(thai?.html).toContain("Hermes");
    expect(contextual.some((topic) => topic.slug === slug)).toBe(true);
  });

  it("keeps Grok media help distinct from the Hermes Agent Gateway guide", async () => {
    const [agentGateway, grokAdmin] = await Promise.all([
      getHelpTopic("hermes-workers", "en"),
      getHelpTopic("grok-via-hermes-admin", "en"),
    ]);

    expect(agentGateway?.html).toContain("hermesAgentRuntime");
    expect(grokAdmin?.html).toContain("separate from");
    expect(grokAdmin?.html).toContain("Hermes Agent Gateway");
  });

  it("documents Work OS permalinks and evidence filters", async () => {
    const topic = await getHelpTopic("work-os", "en");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("Work OS");
    expect(topic?.html).toContain("/admin/work-os?caseId=case-123");
    expect(topic?.html).toContain("timelineSource=role_routine");
    expect(topic?.html).toContain("timelineSource=team_run");
    expect(topic?.html).toContain("timelineSource=workpack_record");
    expect(topic?.html).toContain("timelineSource=work_os");
  });

  it("loads the NemoClaw worker guide in English and keeps the sandbox posture explicit", async () => {
    const topic = await getHelpTopic("nemo-claw-workers", "en");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("NemoClaw");
    expect(topic?.html).toContain("nemoClawSecureWorkerPool");
    expect(topic?.html).toContain("admin-gated");
    expect(topic?.html).toContain("sandbox");
  });

  it("loads the NemoClaw worker guide in Thai and keeps the sandbox posture explicit", async () => {
    const topic = await getHelpTopic("nemo-claw-workers", "th");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("NemoClaw");
    expect(topic?.html).toContain("nemoClawSecureWorkerPool");
    expect(topic?.html).toContain("sandbox");
  });

  it("loads the Document Management guide in English and keeps the shared library flow explicit", async () => {
    const topic = await getHelpTopic("document-management", "en");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("Document Management");
    expect(topic?.html).toContain("Media History");
    expect(topic?.html).toContain("Uploaded files are available immediately in chat attachments");
    expect(topic?.tags).toContain("help/knowledge");
    expect(topic?.html).toContain('href="/help/memory"');
    expect(topic?.graph.outgoing.some((node) => node.slug === "memory")).toBe(true);
    expect(topic?.graph.sharedTags.length).toBeGreaterThan(0);
  });

  it("loads the Document Management guide in Thai and keeps the shared library flow explicit", async () => {
    const topic = await getHelpTopic("document-management", "th");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("จัดการเอกสาร");
    expect(topic?.html).toContain("Media History");
    expect(topic?.html).toContain("ไฟล์ที่อัปโหลดพร้อมใช้งานทันที");
  });

  it("loads the Video Editor guide in English and keeps export behavior explicit", async () => {
    const topic = await getHelpTopic("video-editor", "en");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("Video Editor");
    expect(topic?.html).toContain("Export runs as a background task");
    expect(topic?.html).toContain("AI Draft");
  });

  it("loads the Video Editor guide in Thai and keeps export behavior explicit", async () => {
    const topic = await getHelpTopic("video-editor", "th");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("Video Editor");
    expect(topic?.html).toContain("Export ทำงานเป็น background task");
    expect(topic?.html).toContain("AI Draft");
  });

  it("loads the HiClaw worker guide in English and keeps the cluster posture explicit", async () => {
    const topic = await getHelpTopic("hi-claw-workers", "en");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("HiClaw");
    expect(topic?.html).toContain("hiClawClusterRuntime");
    expect(topic?.html).toContain("collaborative cluster");
  });

  it("loads the HiClaw worker guide in Thai and keeps the cluster posture explicit", async () => {
    const topic = await getHelpTopic("hi-claw-workers", "th");

    expect(topic).not.toBeNull();
    expect(topic?.title).toContain("HiClaw");
    expect(topic?.html).toContain("hiClawClusterRuntime");
    expect(topic?.html).toContain("cluster");
  });

  it("surfaces the new Claw guides in admin monitoring contextual help", async () => {
    const topics = await getContextualHelpTopics("/admin/monitoring", "en");

    expect(topics.some((topic) => topic.slug === "nemo-claw-workers")).toBe(true);
    expect(topics.some((topic) => topic.slug === "hi-claw-workers")).toBe(true);
  });

  it("builds help context for local llm queries", async () => {
    const context = await buildHelpContext("ขอวิธีใช้ local llm", "th");

    expect(context).not.toBeNull();
    expect(context).toContain("/help/local-ai");
  });
});
