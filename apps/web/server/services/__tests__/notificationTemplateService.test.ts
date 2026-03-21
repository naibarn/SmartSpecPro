import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  renderNotification,
  getTemplateKeys,
} from "../notificationTemplateService";

describe("renderTemplate", () => {
  it("returns English template for 'en' locale", () => {
    const result = renderTemplate("media_job.completed", "en", {
      mediaType: "video",
      duration: "5s",
    });
    expect(result.title).toBe("Media Job Completed");
    expect(result.content).toContain("video");
    expect(result.content).toContain("5s");
  });

  it("returns Thai template for 'th' locale", () => {
    const result = renderTemplate("media_job.completed", "th", {
      mediaType: "video",
      duration: "5s",
    });
    expect(result.title).toBe("งาน Media เสร็จสมบูรณ์");
    expect(result.content).toContain("video");
  });

  it("falls back to English for unknown locale (e.g., 'ja')", () => {
    const result = renderTemplate("media_job.completed", "ja", {
      mediaType: "image",
      duration: "2s",
    });
    expect(result.title).toBe("Media Job Completed");
  });

  it("returns raw template key as title and content when key not found", () => {
    const result = renderTemplate("unknown.template", "en");
    expect(result.title).toBe("unknown.template");
    expect(result.content).toBe("unknown.template");
  });

  it("replaces {variableName} tokens with provided values", () => {
    const result = renderTemplate("follow.requested", "en", {
      followerName: "Alice",
    });
    expect(result.content).toBe("Alice has requested to follow you.");
  });

  it("leaves {variableName} literal when variable not provided", () => {
    const result = renderTemplate("media_job.completed", "en");
    expect(result.content).toContain("{mediaType}");
    expect(result.content).toContain("{duration}");
  });

  it("handles template with multiple variables", () => {
    const result = renderTemplate("alert.system_health", "en", {
      metricName: "cpu_usage",
      value: "95%",
      threshold: "80%",
    });
    expect(result.content).toContain("cpu_usage");
    expect(result.content).toContain("95%");
    expect(result.content).toContain("80%");
  });

  it("handles empty variables object", () => {
    const result = renderTemplate("media_job.completed", "en", {});
    expect(result.content).toContain("{mediaType}");
  });

  it("handles template with no variables needed", () => {
    const result = renderTemplate("media_job.completed", "en", {
      mediaType: "video",
      duration: "3s",
    });
    expect(result.title).toBe("Media Job Completed");
  });

  it("never throws — returns fallback for any input", () => {
    expect(() => renderTemplate("", "")).not.toThrow();
    expect(() => renderTemplate("anything", "xx")).not.toThrow();
    expect(() =>
      renderTemplate("a.b.c", "en", { x: "y" })
    ).not.toThrow();
  });
});

describe("renderNotification (backward-compatible)", () => {
  it("returns subject and body for notification.immediate", () => {
    const result = renderNotification("notification.immediate", {
      title: "Test",
      content: "Hello",
      locale: "en",
    });
    expect(result.subject).toBe("Test");
    expect(result.body).toBe("Hello");
  });

  it("returns digest header in English", () => {
    const result = renderNotification("digest.header", {
      locale: "en",
      count: 5,
    });
    expect(result.subject).toBe("Notification Digest");
    expect(result.body).toContain("5");
  });

  it("returns digest header in Thai", () => {
    const result = renderNotification("digest.header", {
      locale: "th",
      count: 3,
    });
    expect(result.subject).toBe("สรุปการแจ้งเตือน");
    expect(result.body).toContain("3");
  });

  it("returns digest footer", () => {
    const result = renderNotification("digest.footer", { locale: "en" });
    expect(result.body).toContain("View all notifications");
  });
});

describe("getTemplateKeys", () => {
  it("returns array of all known template keys", () => {
    const keys = getTemplateKeys();
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.length).toBeGreaterThan(0);
  });

  it("includes 'media_job.completed' and 'alert.escalated'", () => {
    const keys = getTemplateKeys();
    expect(keys).toContain("media_job.completed");
    expect(keys).toContain("alert.escalated");
  });
});
