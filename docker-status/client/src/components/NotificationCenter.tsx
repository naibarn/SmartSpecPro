/**
 * Notification Center Component
 * 
 * Displays notifications and allows managing notification settings
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bell,
  BellOff,
  Settings,
  Check,
  CheckCheck,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  X,
} from "lucide-react";
import { toast } from "sonner";

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

// Format relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// Get icon for notification type
function getNotificationIcon(type: Notification["type"]) {
  switch (type) {
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
    case "error":
      return <AlertCircle className="w-4 h-4 text-red-400" />;
    case "success":
      return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    default:
      return <Info className="w-4 h-4 text-primary" />;
  }
}

// Get badge variant for notification type
function getNotificationBadgeClass(type: Notification["type"]) {
  switch (type) {
    case "warning":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "error":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "success":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    default:
      return "bg-primary/20 text-primary border-primary/30";
  }
}

// Notification Item Component
function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: string) => void;
}) {
  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        notification.read
          ? "bg-background/30 border-border/30 opacity-60"
          : "bg-background/50 border-primary/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{getNotificationIcon(notification.type)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-medium text-sm truncate">{notification.title}</h4>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {formatRelativeTime(notification.timestamp)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {notification.message}
          </p>
          {notification.containerName && (
            <Badge
              variant="outline"
              className="mt-2 text-xs font-mono"
            >
              {notification.containerName}
            </Badge>
          )}
        </div>
        {!notification.read && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => onMarkRead(notification.id)}
          >
            <Check className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

// Settings Panel Component
function NotificationSettings() {
  const utils = trpc.useUtils();
  const { data: settingsData } = trpc.notifications.getSettings.useQuery();
  const updateSettings = trpc.notifications.updateSettings.useMutation({
    onSuccess: () => {
      utils.notifications.getSettings.invalidate();
      toast.success("Settings updated");
    },
  });

  const settings = settingsData?.settings;

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Enable Notifications</h4>
          <p className="text-xs text-muted-foreground">
            Receive alerts for container events
          </p>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(enabled) => updateSettings.mutate({ enabled })}
        />
      </div>

      {/* CPU Threshold */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">CPU Alert Threshold</h4>
          <span className="text-sm font-mono text-primary">
            {settings.cpuThreshold}%
          </span>
        </div>
        <Slider
          value={[settings.cpuThreshold]}
          min={10}
          max={100}
          step={5}
          disabled={!settings.enabled}
          onValueChange={([value]) =>
            updateSettings.mutate({ cpuThreshold: value })
          }
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Alert when CPU usage exceeds this threshold
        </p>
      </div>

      {/* Memory Threshold */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Memory Alert Threshold</h4>
          <span className="text-sm font-mono text-violet-400">
            {settings.memoryThreshold}%
          </span>
        </div>
        <Slider
          value={[settings.memoryThreshold]}
          min={10}
          max={100}
          step={5}
          disabled={!settings.enabled}
          onValueChange={([value]) =>
            updateSettings.mutate({ memoryThreshold: value })
          }
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Alert when memory usage exceeds this threshold
        </p>
      </div>

      {/* Event Notifications */}
      <div className="space-y-3">
        <h4 className="font-medium">Event Notifications</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Container Started</span>
            <Switch
              checked={settings.notifyOnStart}
              disabled={!settings.enabled}
              onCheckedChange={(notifyOnStart) =>
                updateSettings.mutate({ notifyOnStart })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Container Stopped</span>
            <Switch
              checked={settings.notifyOnStop}
              disabled={!settings.enabled}
              onCheckedChange={(notifyOnStop) =>
                updateSettings.mutate({ notifyOnStop })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Main Notification Center Component
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: notificationsData } = trpc.notifications.list.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 5000,
  });

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
    },
  });

  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("All notifications marked as read");
    },
  });

  const clearAll = trpc.notifications.clear.useMutation({
    onSuccess: () => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      toast.success("All notifications cleared");
    },
  });

  const notifications = notificationsData?.notifications || [];
  const unreadCount = unreadData?.count || 0;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative border-primary/50 text-primary hover:bg-primary/10"
        >
          {unreadCount > 0 ? (
            <Bell className="w-4 h-4" />
          ) : (
            <BellOff className="w-4 h-4" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center text-white font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] bg-card/95 backdrop-blur border-primary/30">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            Notification Center
          </SheetTitle>
          <SheetDescription>
            Monitor alerts and configure notification settings
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="notifications" className="mt-6">
          <TabsList className="grid w-full grid-cols-2 bg-background/50">
            <TabsTrigger value="notifications" className="font-mono text-xs">
              Notifications
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings" className="font-mono text-xs">
              <Settings className="w-3 h-3 mr-1" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications" className="mt-4">
            {/* Actions */}
            {notifications.length > 0 && (
              <div className="flex items-center justify-end gap-2 mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllRead.mutate()}
                  disabled={unreadCount === 0}
                  className="text-xs"
                >
                  <CheckCheck className="w-3 h-3 mr-1" />
                  Mark all read
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearAll.mutate()}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear all
                </Button>
              </div>
            )}

            {/* Notification List */}
            <ScrollArea className="h-[calc(100vh-280px)]">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <BellOff className="w-12 h-12 mb-4 opacity-50" />
                  <p className="font-mono text-sm">No notifications</p>
                  <p className="text-xs mt-1">
                    You'll see alerts here when they occur
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pr-4">
                  {notifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkRead={(id) => markRead.mutate({ id })}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <NotificationSettings />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default NotificationCenter;
