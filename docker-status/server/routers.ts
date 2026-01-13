import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  listContainers,
  getContainerLogs,
  getContainerStats,
  startContainer,
  stopContainer,
  restartContainer,
  getDockerInfo,
  formatBytes,
  listImages,
  deleteImage,
  pruneImages,
  listComposeProjects,
  startComposeProject,
  stopComposeProject,
  restartComposeProject,
} from "./docker";
import {
  sendNotification,
  getWebhookConfigs,
  createWebhookConfig,
  updateWebhookConfig,
  deleteWebhookConfig,
  getEmailConfigs,
  createEmailConfig,
  updateEmailConfig,
  deleteEmailConfig,
  getNotificationHistoryList,
  testWebhook,
  NotificationEvent,
  NotificationSeverity,
} from "./webhookService";

// In-memory stats history storage (for demo - in production use database)
interface StatsHistoryEntry {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsage: number;
  networkRx: number;
  networkTx: number;
}

const statsHistory: Map<string, StatsHistoryEntry[]> = new Map();
const MAX_HISTORY_ENTRIES = 60; // Keep last 60 entries (10 minutes at 10s intervals)

// Notification settings storage
interface NotificationSettings {
  enabled: boolean;
  cpuThreshold: number;
  memoryThreshold: number;
  notifyOnStop: boolean;
  notifyOnStart: boolean;
}

interface Notification {
  id: string;
  type: "warning" | "error" | "info" | "success";
  title: string;
  message: string;
  containerId?: string;
  containerName?: string;
  timestamp: number;
  read: boolean;
}

let notificationSettings: NotificationSettings = {
  enabled: true,
  cpuThreshold: 80,
  memoryThreshold: 80,
  notifyOnStop: true,
  notifyOnStart: true,
};

const notifications: Notification[] = [];
const MAX_NOTIFICATIONS = 100;

// Helper to add notification and send to external services
async function addNotification(
  type: Notification["type"],
  title: string,
  message: string,
  containerId?: string,
  containerName?: string,
  event?: NotificationEvent
) {
  const notification: Notification = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    message,
    containerId,
    containerName,
    timestamp: Date.now(),
    read: false,
  };

  notifications.unshift(notification);
  
  // Keep only last MAX_NOTIFICATIONS
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.pop();
  }

  // Send to external webhooks/email if event is provided
  if (event) {
    const severity: NotificationSeverity = 
      type === "error" ? "critical" : 
      type === "warning" ? "warning" : "info";

    try {
      await sendNotification({
        event,
        title,
        message,
        severity,
        containerName,
        containerId,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Failed to send external notification:", error);
    }
  }

  return notification;
}

// Helper to update stats history
function updateStatsHistory(containerId: string, containerName: string, stats: StatsHistoryEntry) {
  let history = statsHistory.get(containerId);
  if (!history) {
    history = [];
    statsHistory.set(containerId, history);
  }

  history.push(stats);

  // Keep only last MAX_HISTORY_ENTRIES
  if (history.length > MAX_HISTORY_ENTRIES) {
    history.shift();
  }

  // Check thresholds and create notifications
  if (notificationSettings.enabled) {
    if (stats.cpuPercent > notificationSettings.cpuThreshold) {
      addNotification(
        "warning",
        "High CPU Usage",
        `Container ${containerName} is using ${stats.cpuPercent.toFixed(1)}% CPU (threshold: ${notificationSettings.cpuThreshold}%)`,
        containerId,
        containerName,
        "high_cpu"
      );
    }

    if (stats.memoryPercent > notificationSettings.memoryThreshold) {
      addNotification(
        "warning",
        "High Memory Usage",
        `Container ${containerName} is using ${stats.memoryPercent.toFixed(1)}% memory (threshold: ${notificationSettings.memoryThreshold}%)`,
        containerId,
        containerName,
        "high_memory"
      );
    }
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Docker management routes
  docker: router({
    // Get Docker system info
    info: publicProcedure.query(async () => {
      try {
        return await getDockerInfo();
      } catch (error) {
        return {
          version: "N/A",
          containers: 0,
          running: 0,
          paused: 0,
          stopped: 0,
          connectionType: "none" as const,
          error: String(error),
        };
      }
    }),

    // List all containers
    list: publicProcedure.query(async () => {
      try {
        const containers = await listContainers();
        return { containers, error: null };
      } catch (error) {
        return { containers: [], error: String(error) };
      }
    }),

    // Get container stats
    stats: publicProcedure
      .input(z.object({ containerId: z.string(), containerName: z.string().optional() }))
      .query(async ({ input }) => {
        const stats = await getContainerStats(input.containerId);
        
        // Update history
        updateStatsHistory(input.containerId, input.containerName || input.containerId, {
          timestamp: Date.now(),
          cpuPercent: stats.cpuPercent,
          memoryPercent: stats.memoryPercent,
          memoryUsage: stats.memoryUsage,
          networkRx: stats.networkRx,
          networkTx: stats.networkTx,
        });

        return stats;
      }),

    // Get container stats history for graphs
    statsHistory: publicProcedure
      .input(z.object({ containerId: z.string() }))
      .query(({ input }) => {
        const history = statsHistory.get(input.containerId) || [];
        return { history };
      }),

    // Get container logs
    logs: publicProcedure
      .input(z.object({ 
        containerId: z.string(),
        tail: z.number().optional().default(100),
      }))
      .query(async ({ input }) => {
        return await getContainerLogs(input.containerId, input.tail);
      }),

    // Start container
    start: publicProcedure
      .input(z.object({ containerId: z.string(), containerName: z.string().optional() }))
      .mutation(async ({ input }) => {
        await startContainer(input.containerId);
        
        if (notificationSettings.enabled && notificationSettings.notifyOnStart) {
          await addNotification(
            "success",
            "Container Started",
            `Container ${input.containerName || input.containerId} has been started`,
            input.containerId,
            input.containerName,
            "container_started"
          );
        }

        return { success: true, message: `Container ${input.containerId} started` };
      }),

    // Stop container
    stop: publicProcedure
      .input(z.object({ containerId: z.string(), containerName: z.string().optional() }))
      .mutation(async ({ input }) => {
        await stopContainer(input.containerId);

        if (notificationSettings.enabled && notificationSettings.notifyOnStop) {
          await addNotification(
            "info",
            "Container Stopped",
            `Container ${input.containerName || input.containerId} has been stopped`,
            input.containerId,
            input.containerName,
            "container_stopped"
          );
        }

        return { success: true, message: `Container ${input.containerId} stopped` };
      }),

    // Restart container
    restart: publicProcedure
      .input(z.object({ containerId: z.string(), containerName: z.string().optional() }))
      .mutation(async ({ input }) => {
        await restartContainer(input.containerId);

        if (notificationSettings.enabled) {
          await addNotification(
            "info",
            "Container Restarted",
            `Container ${input.containerName || input.containerId} has been restarted`,
            input.containerId,
            input.containerName,
            "container_restarted"
          );
        }

        return { success: true, message: `Container ${input.containerId} restarted` };
      }),
  }),

  // Docker Images routes
  images: router({
    // List all images
    list: publicProcedure.query(async () => {
      try {
        const images = await listImages();
        return { images, error: null };
      } catch (error) {
        return { images: [], error: String(error) };
      }
    }),

    // Delete an image
    delete: publicProcedure
      .input(z.object({ imageId: z.string(), force: z.boolean().optional() }))
      .mutation(async ({ input }) => {
        await deleteImage(input.imageId, input.force);
        return { success: true, message: `Image ${input.imageId} deleted` };
      }),

    // Prune unused images
    prune: publicProcedure.mutation(async () => {
      const result = await pruneImages();
      return { 
        success: true, 
        deleted: result.deleted,
        spaceReclaimed: result.spaceReclaimed,
        spaceReclaimedFormatted: formatBytes(result.spaceReclaimed),
      };
    }),
  }),

  // Docker Compose routes
  compose: router({
    // List all compose projects
    list: publicProcedure.query(async () => {
      try {
        const projects = await listComposeProjects();
        return { projects, error: null };
      } catch (error) {
        return { projects: [], error: String(error) };
      }
    }),

    // Start all services in a project
    start: publicProcedure
      .input(z.object({ projectName: z.string() }))
      .mutation(async ({ input }) => {
        await startComposeProject(input.projectName);
        return { success: true, message: `Compose project ${input.projectName} started` };
      }),

    // Stop all services in a project
    stop: publicProcedure
      .input(z.object({ projectName: z.string() }))
      .mutation(async ({ input }) => {
        await stopComposeProject(input.projectName);
        return { success: true, message: `Compose project ${input.projectName} stopped` };
      }),

    // Restart all services in a project
    restart: publicProcedure
      .input(z.object({ projectName: z.string() }))
      .mutation(async ({ input }) => {
        await restartComposeProject(input.projectName);
        return { success: true, message: `Compose project ${input.projectName} restarted` };
      }),
  }),

  // Notification routes
  notifications: router({
    // Get all notifications
    list: publicProcedure.query(() => {
      return { notifications };
    }),

    // Get unread count
    unreadCount: publicProcedure.query(() => {
      return { count: notifications.filter(n => !n.read).length };
    }),

    // Mark notification as read
    markRead: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => {
        const notification = notifications.find(n => n.id === input.id);
        if (notification) {
          notification.read = true;
        }
        return { success: true };
      }),

    // Mark all as read
    markAllRead: publicProcedure.mutation(() => {
      notifications.forEach(n => n.read = true);
      return { success: true };
    }),

    // Clear all notifications
    clear: publicProcedure.mutation(() => {
      notifications.length = 0;
      return { success: true };
    }),

    // Get notification settings
    getSettings: publicProcedure.query(() => {
      return { settings: notificationSettings };
    }),

    // Update notification settings
    updateSettings: publicProcedure
      .input(z.object({
        enabled: z.boolean().optional(),
        cpuThreshold: z.number().min(0).max(100).optional(),
        memoryThreshold: z.number().min(0).max(100).optional(),
        notifyOnStop: z.boolean().optional(),
        notifyOnStart: z.boolean().optional(),
      }))
      .mutation(({ input }) => {
        notificationSettings = {
          ...notificationSettings,
          ...input,
        };
        return { success: true, settings: notificationSettings };
      }),
  }),

  // Webhook configuration routes
  webhooks: router({
    // List all webhook configs
    list: publicProcedure.query(async () => {
      const configs = await getWebhookConfigs();
      return { configs };
    }),

    // Create webhook config
    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        url: z.string().url(),
        type: z.enum(["slack", "discord", "generic", "teams"]),
        enabled: z.boolean().optional(),
        events: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        await createWebhookConfig(input);
        return { success: true };
      }),

    // Update webhook config
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        url: z.string().url().optional(),
        type: z.enum(["slack", "discord", "generic", "teams"]).optional(),
        enabled: z.boolean().optional(),
        events: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateWebhookConfig(id, data);
        return { success: true };
      }),

    // Delete webhook config
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteWebhookConfig(input.id);
        return { success: true };
      }),

    // Test webhook
    test: publicProcedure
      .input(z.object({
        url: z.string().url(),
        type: z.enum(["slack", "discord", "generic", "teams"]),
      }))
      .mutation(async ({ input }) => {
        const result = await testWebhook(input.url, input.type);
        return result;
      }),
  }),

  // Email configuration routes
  emails: router({
    // List all email configs
    list: publicProcedure.query(async () => {
      const configs = await getEmailConfigs();
      return { configs };
    }),

    // Create email config
    create: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        smtpHost: z.string().min(1),
        smtpPort: z.number().optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
        fromEmail: z.string().email(),
        toEmails: z.array(z.string().email()),
        enabled: z.boolean().optional(),
        events: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        await createEmailConfig(input);
        return { success: true };
      }),

    // Update email config
    update: publicProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        smtpHost: z.string().min(1).optional(),
        smtpPort: z.number().optional(),
        smtpUser: z.string().optional(),
        smtpPass: z.string().optional(),
        fromEmail: z.string().email().optional(),
        toEmails: z.array(z.string().email()).optional(),
        enabled: z.boolean().optional(),
        events: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateEmailConfig(id, data);
        return { success: true };
      }),

    // Delete email config
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteEmailConfig(input.id);
        return { success: true };
      }),
  }),

  // Notification history
  notificationHistory: router({
    list: publicProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ input }) => {
        const history = await getNotificationHistoryList(input?.limit || 50);
        return { history };
      }),
  }),
});

export type AppRouter = typeof appRouter;
