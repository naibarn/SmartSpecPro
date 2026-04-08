import { beforeEach, describe, expect, it } from "vitest";
import {
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

  it("builds help context for local llm queries", async () => {
    const context = await buildHelpContext("ขอวิธีใช้ local llm", "th");

    expect(context).not.toBeNull();
    expect(context).toContain("/help/local-ai");
  });
});
