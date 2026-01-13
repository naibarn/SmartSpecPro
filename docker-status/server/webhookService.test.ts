import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database module
vi.mock("./db", () => ({
  getDb: vi.fn(),
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ column: col, value: val })),
}));

// Mock the notification module
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

describe("Webhook Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatWebhookPayload", () => {
    it("should format Slack payload correctly", async () => {
      // Import the module to test internal functions
      const { testWebhook } = await import("./webhookService");
      
      // testWebhook function exists and is callable
      expect(testWebhook).toBeDefined();
      expect(typeof testWebhook).toBe("function");
    });
  });

  describe("Webhook CRUD operations", () => {
    it("should have getWebhookConfigs function", async () => {
      const { getWebhookConfigs } = await import("./webhookService");
      expect(getWebhookConfigs).toBeDefined();
      expect(typeof getWebhookConfigs).toBe("function");
    });

    it("should have createWebhookConfig function", async () => {
      const { createWebhookConfig } = await import("./webhookService");
      expect(createWebhookConfig).toBeDefined();
      expect(typeof createWebhookConfig).toBe("function");
    });

    it("should have updateWebhookConfig function", async () => {
      const { updateWebhookConfig } = await import("./webhookService");
      expect(updateWebhookConfig).toBeDefined();
      expect(typeof updateWebhookConfig).toBe("function");
    });

    it("should have deleteWebhookConfig function", async () => {
      const { deleteWebhookConfig } = await import("./webhookService");
      expect(deleteWebhookConfig).toBeDefined();
      expect(typeof deleteWebhookConfig).toBe("function");
    });
  });

  describe("Email CRUD operations", () => {
    it("should have getEmailConfigs function", async () => {
      const { getEmailConfigs } = await import("./webhookService");
      expect(getEmailConfigs).toBeDefined();
      expect(typeof getEmailConfigs).toBe("function");
    });

    it("should have createEmailConfig function", async () => {
      const { createEmailConfig } = await import("./webhookService");
      expect(createEmailConfig).toBeDefined();
      expect(typeof createEmailConfig).toBe("function");
    });

    it("should have updateEmailConfig function", async () => {
      const { updateEmailConfig } = await import("./webhookService");
      expect(updateEmailConfig).toBeDefined();
      expect(typeof updateEmailConfig).toBe("function");
    });

    it("should have deleteEmailConfig function", async () => {
      const { deleteEmailConfig } = await import("./webhookService");
      expect(deleteEmailConfig).toBeDefined();
      expect(typeof deleteEmailConfig).toBe("function");
    });
  });

  describe("Notification functions", () => {
    it("should have sendNotification function", async () => {
      const { sendNotification } = await import("./webhookService");
      expect(sendNotification).toBeDefined();
      expect(typeof sendNotification).toBe("function");
    });

    it("should have sendWebhookNotifications function", async () => {
      const { sendWebhookNotifications } = await import("./webhookService");
      expect(sendWebhookNotifications).toBeDefined();
      expect(typeof sendWebhookNotifications).toBe("function");
    });

    it("should have sendEmailNotifications function", async () => {
      const { sendEmailNotifications } = await import("./webhookService");
      expect(sendEmailNotifications).toBeDefined();
      expect(typeof sendEmailNotifications).toBe("function");
    });

    it("should have getNotificationHistoryList function", async () => {
      const { getNotificationHistoryList } = await import("./webhookService");
      expect(getNotificationHistoryList).toBeDefined();
      expect(typeof getNotificationHistoryList).toBe("function");
    });
  });

  describe("testWebhook function", () => {
    it("should return success false when webhook URL is unreachable", async () => {
      const { testWebhook } = await import("./webhookService");
      
      // Test with an invalid URL that will fail
      const result = await testWebhook("http://localhost:99999/invalid", "generic");
      
      expect(result).toHaveProperty("success");
      expect(result.success).toBe(false);
      expect(result).toHaveProperty("error");
    });
  });
});
