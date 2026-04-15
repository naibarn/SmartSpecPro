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
