/**
 * Notification Service
 * 
 * Manages notifications for container events and resource alerts
 */

import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";

// Notification types
export type NotificationType = "warning" | "error" | "info" | "success";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  containerId?: string;
  containerName?: string;
  timestamp: number;
  read: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  cpuThreshold: number;
  memoryThreshold: number;
  notifyOnStart: boolean;
  notifyOnStop: boolean;
}

// In-memory storage (in production, use database)
let notifications: Notification[] = [];
let settings: NotificationSettings = {
  enabled: true,
  cpuThreshold: 80,
  memoryThreshold: 80,
  notifyOnStart: true,
  notifyOnStop: true,
};

// Generate unique ID
function generateId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Add notification
export function addNotification(
  type: NotificationType,
  title: string,
  message: string,
  containerId?: string,
  containerName?: string
): Notification {
  const notification: Notification = {
    id: generateId(),
    type,
    title,
    message,
    containerId,
    containerName,
    timestamp: Date.now(),
    read: false,
  };
  
  notifications.unshift(notification);
  
  // Keep only last 100 notifications
  if (notifications.length > 100) {
    notifications = notifications.slice(0, 100);
  }
  
  return notification;
}

// Check resource thresholds and create alerts
export function checkResourceThresholds(
  containerId: string,
  containerName: string,
  cpuPercent: number,
  memoryPercent: number
): void {
  if (!settings.enabled) return;
  
  if (cpuPercent > settings.cpuThreshold) {
    // Check if we already have a recent CPU alert for this container
    const recentAlert = notifications.find(
      n => n.containerId === containerId && 
           n.title.includes("CPU") && 
           Date.now() - n.timestamp < 60000 // Within last minute
    );
    
    if (!recentAlert) {
      addNotification(
        "warning",
        `High CPU Usage: ${containerName}`,
        `CPU usage is at ${cpuPercent.toFixed(1)}%, exceeding threshold of ${settings.cpuThreshold}%`,
        containerId,
        containerName
      );
    }
  }
  
  if (memoryPercent > settings.memoryThreshold) {
    const recentAlert = notifications.find(
      n => n.containerId === containerId && 
           n.title.includes("Memory") && 
           Date.now() - n.timestamp < 60000
    );
    
    if (!recentAlert) {
      addNotification(
        "warning",
        `High Memory Usage: ${containerName}`,
        `Memory usage is at ${memoryPercent.toFixed(1)}%, exceeding threshold of ${settings.memoryThreshold}%`,
        containerId,
        containerName
      );
    }
  }
}

// Notify container state change
export function notifyContainerStateChange(
  containerId: string,
  containerName: string,
  action: "started" | "stopped" | "restarted"
): void {
  if (!settings.enabled) return;
  
  if (action === "started" && settings.notifyOnStart) {
    addNotification(
      "success",
      `Container Started: ${containerName}`,
      `Container ${containerName} has been started successfully`,
      containerId,
      containerName
    );
  }
  
  if (action === "stopped" && settings.notifyOnStop) {
    addNotification(
      "info",
      `Container Stopped: ${containerName}`,
      `Container ${containerName} has been stopped`,
      containerId,
      containerName
    );
  }
  
  if (action === "restarted") {
    addNotification(
      "info",
      `Container Restarted: ${containerName}`,
      `Container ${containerName} has been restarted`,
      containerId,
      containerName
    );
  }
}

// Notification router
export const notificationsRouter = router({
  // List all notifications
  list: publicProcedure.query(() => {
    return { notifications };
  }),
  
  // Get unread count
  unreadCount: publicProcedure.query(() => {
    const count = notifications.filter(n => !n.read).length;
    return { count };
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
    notifications.forEach(n => { n.read = true; });
    return { success: true };
  }),
  
  // Clear all notifications
  clear: publicProcedure.mutation(() => {
    notifications = [];
    return { success: true };
  }),
  
  // Get settings
  getSettings: publicProcedure.query(() => {
    return { settings };
  }),
  
  // Update settings
  updateSettings: publicProcedure
    .input(z.object({
      enabled: z.boolean().optional(),
      cpuThreshold: z.number().min(10).max(100).optional(),
      memoryThreshold: z.number().min(10).max(100).optional(),
      notifyOnStart: z.boolean().optional(),
      notifyOnStop: z.boolean().optional(),
    }))
    .mutation(({ input }) => {
      settings = { ...settings, ...input };
      return { success: true, settings };
    }),
});
