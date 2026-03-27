import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });
const mockGetSmtpConfig = vi.fn();
const mockCreateTransporter = vi.fn();

vi.mock("../emailService", () => ({
  getSmtpConfig: (...args: any[]) => mockGetSmtpConfig(...args),
  createTransporter: (...args: any[]) => mockCreateTransporter(...args),
}));

vi.mock("../notificationTemplateService", () => ({
  renderNotification: vi.fn((_key: string, data: any) => ({
    subject: data.title || "Notification",
    body: data.content || "Content",
  })),
}));

import {
  sendNotificationEmail,
  sendNotificationDigest,
} from "../notificationEmailService";

const smtpConfig = {
  host: "smtp.test.com",
  port: 587,
  secure: false,
  user: "test@test.com",
  pass: "pass",
  fromName: "SmartAIHub",
  fromEmail: "noreply@test.com",
};

describe("sendNotificationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSmtpConfig.mockResolvedValue(smtpConfig);
    mockCreateTransporter.mockResolvedValue({
      sendMail: mockSendMail,
    });
  });

  it("sends email via nodemailer for high priority notification", async () => {
    const result = await sendNotificationEmail({
      userEmail: "user@test.com",
      userName: "Test User",
      locale: "en",
      notification: {
        id: 1,
        type: "system",
        title: "Alert",
        content: "Something important",
        priority: "high",
      },
    });
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
    expect(mockSendMail.mock.calls[0][0].to).toBe("user@test.com");
  });

  it("sends email via nodemailer for critical priority notification", async () => {
    const result = await sendNotificationEmail({
      userEmail: "user@test.com",
      locale: "en",
      notification: {
        id: 2,
        type: "security",
        title: "Critical Alert",
        content: "Urgent matter",
        priority: "critical",
      },
    });
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
  });

  it("uses template service for localized content with correct locale parameter", async () => {
    const { renderNotification } = await import(
      "../notificationTemplateService"
    );
    await sendNotificationEmail({
      userEmail: "user@test.com",
      locale: "th",
      notification: {
        id: 3,
        type: "system",
        title: "Thai Alert",
        content: "เนื้อหา",
        priority: "high",
      },
    });
    expect(renderNotification).toHaveBeenCalledWith(
      "notification.immediate",
      expect.objectContaining({ locale: "th" }),
    );
  });

  it("includes unsubscribe link in email body", async () => {
    await sendNotificationEmail({
      userEmail: "user@test.com",
      locale: "en",
      notification: {
        id: 4,
        type: "system",
        title: "Test",
        content: "Body",
        priority: "high",
      },
    });
    const html = mockSendMail.mock.calls[0][0].html as string;
    expect(html).toContain("/settings?tab=notifications");
  });

  it("includes action URL when actionUrl is present", async () => {
    await sendNotificationEmail({
      userEmail: "user@test.com",
      locale: "en",
      notification: {
        id: 5,
        type: "system",
        title: "Test",
        content: "Body",
        priority: "high",
        actionUrl: "/admin/dashboard",
      },
    });
    const html = mockSendMail.mock.calls[0][0].html as string;
    expect(html).toContain("/admin/dashboard");
  });

  it("does nothing and returns false if user has no email address", async () => {
    const result = await sendNotificationEmail({
      userEmail: "",
      locale: "en",
      notification: {
        id: 6,
        type: "system",
        title: "Test",
        content: "Body",
        priority: "high",
      },
    });
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("does nothing and returns false if SMTP is not configured", async () => {
    mockCreateTransporter.mockResolvedValue(null);
    const result = await sendNotificationEmail({
      userEmail: "user@test.com",
      locale: "en",
      notification: {
        id: 7,
        type: "system",
        title: "Test",
        content: "Body",
        priority: "high",
      },
    });
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("returns false and logs error if sendMail throws", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await sendNotificationEmail({
      userEmail: "user@test.com",
      locale: "en",
      notification: {
        id: 8,
        type: "system",
        title: "Test",
        content: "Body",
        priority: "high",
      },
    });
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("does not send for low priority notification (digest-only)", async () => {
    const result = await sendNotificationEmail({
      userEmail: "user@test.com",
      locale: "en",
      notification: {
        id: 9,
        type: "system",
        title: "Test",
        content: "Body",
        priority: "low",
      },
    });
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("does not send for normal priority notification (digest-only)", async () => {
    const result = await sendNotificationEmail({
      userEmail: "user@test.com",
      locale: "en",
      notification: {
        id: 10,
        type: "system",
        title: "Test",
        content: "Body",
        priority: "normal",
      },
    });
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe("sendNotificationDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSmtpConfig.mockResolvedValue(smtpConfig);
    mockCreateTransporter.mockResolvedValue({
      sendMail: mockSendMail,
    });
  });

  const baseNotifications = [
    {
      id: 1,
      title: "Notif 1",
      content: "Content 1",
      priority: "normal",
      createdAt: new Date("2026-03-20T10:00:00Z"),
    },
    {
      id: 2,
      title: "Notif 2",
      content: "Content 2",
      priority: "low",
      createdAt: new Date("2026-03-20T09:00:00Z"),
    },
  ];

  it("collects unread notifications since last digest timestamp", async () => {
    const result = await sendNotificationDigest({
      userEmail: "user@test.com",
      userName: "Test",
      locale: "en",
      userId: 1,
      notifications: baseNotifications,
    });
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();
  });

  it("sends digest email with up to 20 notification summaries", async () => {
    const manyNotifs = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      title: `Notif ${i + 1}`,
      content: `Content ${i + 1}`,
      priority: "normal",
      createdAt: new Date(),
    }));
    await sendNotificationDigest({
      userEmail: "user@test.com",
      locale: "en",
      userId: 1,
      notifications: manyNotifs,
    });
    const html = mockSendMail.mock.calls[0][0].html as string;
    // Should contain first 20 items but not the 21st
    expect(html).toContain("Notif 1");
    expect(html).toContain("Notif 20");
    expect(html).not.toContain("Notif 21");
  });

  it("sends nothing and returns false if zero unread notifications", async () => {
    const result = await sendNotificationDigest({
      userEmail: "user@test.com",
      locale: "en",
      userId: 1,
      notifications: [],
    });
    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("includes 'View all' link to /notifications in digest email", async () => {
    await sendNotificationDigest({
      userEmail: "user@test.com",
      locale: "en",
      userId: 1,
      notifications: baseNotifications,
    });
    const html = mockSendMail.mock.calls[0][0].html as string;
    expect(html).toContain("/notifications");
  });

  it("uses template service for digest header/footer localization", async () => {
    const { renderNotification } = await import(
      "../notificationTemplateService"
    );
    await sendNotificationDigest({
      userEmail: "user@test.com",
      locale: "th",
      userId: 1,
      notifications: baseNotifications,
    });
    expect(renderNotification).toHaveBeenCalledWith(
      "digest.header",
      expect.objectContaining({ locale: "th" }),
    );
  });

  it("truncates notification titles longer than 100 characters in digest", async () => {
    const longTitle = "A".repeat(120);
    await sendNotificationDigest({
      userEmail: "user@test.com",
      locale: "en",
      userId: 1,
      notifications: [
        {
          id: 1,
          title: longTitle,
          content: "Content",
          priority: "normal",
          createdAt: new Date(),
        },
      ],
    });
    const html = mockSendMail.mock.calls[0][0].html as string;
    expect(html).not.toContain(longTitle);
    expect(html).toContain("A".repeat(100));
  });
});
