/**
 * NotificationPreferencesPanel — Settings tab content for managing notification
 * preferences. Renders a per-category grid with in-app/email/telegram toggles,
 * minimum severity, and mute/snooze controls.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
import { WebhookManagement } from "./WebhookManagement";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bell,
  CreditCard,
  Loader2,
  VolumeX,
  Volume2,
  Mail,
  Smartphone,
  MessageSquare,
  Shield,
  Briefcase,
  Cpu,
  Image,
  GitBranch,
  Sparkles,
  MessageCircle,
  Users,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const NOTIFICATION_CATEGORIES = [
  "system_health",
  "credits",
  "media_jobs",
  "workflow",
  "skill",
  "feedback",
  "agency",
  "follow",
  "scheduled",
  "security",
  "business",
] as const;

type Category = (typeof NOTIFICATION_CATEGORIES)[number];

const CATEGORY_META: Record<
  Category,
  { label: string; labelTh: string; icon: typeof Bell }
> = {
  system_health: { label: "System Health", labelTh: "สุขภาพระบบ", icon: Cpu },
  credits: { label: "Credits", labelTh: "เครดิต", icon: CreditCard },
  media_jobs: {
    label: "Media Jobs",
    labelTh: "งานสื่อ",
    icon: Image,
  },
  workflow: { label: "Workflow", labelTh: "เวิร์คโฟลว์", icon: GitBranch },
  skill: { label: "Skills", labelTh: "ทักษะ", icon: Sparkles },
  feedback: {
    label: "Feedback",
    labelTh: "ความคิดเห็น",
    icon: MessageCircle,
  },
  agency: { label: "Agency", labelTh: "เอเจนซี่", icon: Users },
  follow: { label: "Follows", labelTh: "ติดตาม", icon: Bell },
  scheduled: { label: "Scheduled", labelTh: "กำหนดการ", icon: Clock },
  security: { label: "Security", labelTh: "ความปลอดภัย", icon: Shield },
  business: { label: "Business", labelTh: "ธุรกิจ", icon: Briefcase },
};

const SEVERITY_OPTIONS = [
  { value: "all", label: "All" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

const SNOOZE_DURATIONS = [
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "24 hours", hours: 24 },
  { label: "1 week", hours: 168 },
] as const;

interface PreferenceRow {
  category: string;
  inApp: boolean;
  email: boolean;
  telegram: boolean;
  minSeverity: "low" | "normal" | "high" | "critical" | null;
  mutedUntil: Date | null;
  emailDigestFrequency: string | null;
  emailDigestHour: number | null;
  createdAt: Date;
  updatedAt: Date;
  id: number;
  userId: number;
}

function isMuted(mutedUntil: string | Date | null | undefined): boolean {
  if (!mutedUntil) return false;
  return new Date(mutedUntil) > new Date();
}

function formatMutedUntil(mutedUntil: string | Date): string {
  const d = new Date(mutedUntil);
  return d.toLocaleString();
}

/**
 * Check if notification preferences feature is enabled for the current tenant.
 * Uses the tenant feature flags system — section-13 will add the formal
 * `notificationPreferences` key to TenantFeatureFlags. Until then, the flag
 * defaults to true (enabled) since the backend endpoints already exist.
 */
function useNotificationPreferencesEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ["tenant", "current"],
    queryFn: async () => {
      const res = await fetch("/api/tenant/current");
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
  const flags = data?.tenant?.featureFlags as Record<string, boolean> | undefined;
  // Default to true — section-13 will add the formal flag
  return flags?.notificationPreferences !== false;
}

export function NotificationPreferencesPanel() {
  const webhookEnabled = useTenantFeatureFlag("notificationWebhookDelivery");
  const isEnabled = useNotificationPreferencesEnabled();
  const utils = trpc.useUtils();
  const [mutatingCategories, setMutatingCategories] = useState<Set<string>>(
    new Set(),
  );

  const prefsQuery = trpc.notificationPreferences.getPreferences.useQuery(
    undefined,
    { enabled: isEnabled },
  );

  const upsertMutation =
    trpc.notificationPreferences.upsertPreference.useMutation({
      onMutate: async (input) => {
        setMutatingCategories((prev) => new Set(prev).add(input.category));
        // Optimistic update
        await utils.notificationPreferences.getPreferences.cancel();
        const previous =
          utils.notificationPreferences.getPreferences.getData();
        utils.notificationPreferences.getPreferences.setData(
          undefined,
          (old) => {
            if (!old) return old;
            const existing = old.find((p) => p.category === input.category);
            const nextMutedUntil =
              input.mutedUntil === undefined
                ? existing?.mutedUntil ?? null
                : input.mutedUntil
                  ? new Date(input.mutedUntil)
                  : null;
            const nextPreference: PreferenceRow = existing
              ? {
                  ...existing,
                  inApp: input.inApp ?? existing.inApp,
                  email: input.email ?? existing.email,
                  telegram: input.telegram ?? existing.telegram,
                  minSeverity: input.minSeverity ?? existing.minSeverity,
                  mutedUntil: nextMutedUntil,
                  emailDigestFrequency:
                    input.emailDigestFrequency ??
                    existing.emailDigestFrequency,
                  emailDigestHour:
                    input.emailDigestHour ?? existing.emailDigestHour,
                  updatedAt: new Date(),
                }
              : {
                  id: -1,
                  userId: -1,
                  category: input.category,
                  inApp: input.inApp ?? true,
                  email: input.email ?? false,
                  telegram: input.telegram ?? false,
                  minSeverity: input.minSeverity ?? null,
                  mutedUntil: nextMutedUntil,
                  emailDigestFrequency: input.emailDigestFrequency ?? null,
                  emailDigestHour: input.emailDigestHour ?? null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };
            if (existing) {
              return old.map((p) =>
                p.category === input.category ? nextPreference : p,
              );
            }
            return [...old, nextPreference];
          },
        );
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) {
          utils.notificationPreferences.getPreferences.setData(
            undefined,
            context.previous,
          );
        }
        toast.error("Failed to update notification preference");
      },
      onSettled: (_data, _err, input) => {
        setMutatingCategories((prev) => {
          const next = new Set(prev);
          next.delete(input.category);
          return next;
        });
        utils.notificationPreferences.getPreferences.invalidate();
      },
    });

  const snoozeMutation =
    trpc.notificationPreferences.snoozeCategory.useMutation({
      onSuccess: () => {
        utils.notificationPreferences.getPreferences.invalidate();
        toast.success("Notification mute updated");
      },
      onError: () => {
        toast.error("Failed to update mute setting");
      },
    });

  function getPreference(category: Category): PreferenceRow {
    const pref = prefsQuery.data?.find((p) => p.category === category);
    return {
      id: pref?.id ?? -1,
      userId: pref?.userId ?? -1,
      category,
      inApp: pref?.inApp ?? true,
      email: pref?.email ?? false,
      telegram: pref?.telegram ?? false,
      minSeverity: pref?.minSeverity ?? (category === "credits" ? "high" : null),
      mutedUntil: pref?.mutedUntil ?? null,
      emailDigestFrequency: pref?.emailDigestFrequency ?? null,
      emailDigestHour: pref?.emailDigestHour ?? null,
      createdAt: pref?.createdAt ?? new Date(),
      updatedAt: pref?.updatedAt ?? new Date(),
    };
  }

  function handleToggle(
    category: Category,
    field: "inApp" | "email" | "telegram",
    value: boolean,
  ) {
    upsertMutation.mutate({ category, [field]: value });
  }

  function handleSeverityChange(category: Category, value: string) {
    upsertMutation.mutate({
      category,
      minSeverity:
        value === "all"
          ? null
          : (value as "low" | "normal" | "high" | "critical"),
    });
  }

  function handleSnooze(category: Category, hours: number) {
    const mutedUntil = new Date(
      Date.now() + hours * 60 * 60 * 1000,
    ).toISOString();
    snoozeMutation.mutate({ category, mutedUntil });
  }

  function handleUnmute(category: Category) {
    snoozeMutation.mutate({ category, mutedUntil: null });
  }

  if (!isEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Notification Preferences
          </h2>
          <p className="text-gray-600">
            Notification preferences are not yet enabled for your organization.
          </p>
        </div>
      </div>
    );
  }

  if (prefsQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Notification Preferences
          </h2>
          <p className="text-gray-600">
            Configure how you receive notifications
          </p>
        </div>
        <div className="space-y-3" data-testid="loading-skeleton">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-14 bg-gray-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Notification Preferences
        </h2>
        <p className="text-gray-600">
          Configure how you receive notifications for each category
        </p>
      </div>

      {/* Header row */}
      <div className="hidden sm:grid sm:grid-cols-[1fr_80px_80px_80px_120px_100px] gap-3 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        <div>Category</div>
        <div className="text-center">In-App</div>
        <div className="text-center">Email</div>
        <div className="text-center">Telegram</div>
        <div className="text-center">Min Severity</div>
        <div className="text-center">Mute</div>
      </div>

      {/* Category rows */}
      <div className="space-y-2">
        {NOTIFICATION_CATEGORIES.map((category) => {
          const pref = getPreference(category);
          const meta = CATEGORY_META[category];
          const Icon = meta.icon;
          const muted = isMuted(pref.mutedUntil);
          const isMutating = mutatingCategories.has(category);

          return (
            <div
              key={category}
              data-testid={`category-row-${category}`}
              className={`grid grid-cols-1 sm:grid-cols-[1fr_80px_80px_80px_120px_100px] gap-3 items-center px-4 py-3 rounded-xl border transition-colors ${
                muted
                  ? "bg-gray-50 border-gray-200 opacity-60"
                  : "bg-white border-gray-100 hover:border-purple-200"
              }`}
            >
              {/* Category label */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <span className="font-medium text-gray-900">
                    {meta.label}
                  </span>
                  {muted && pref.mutedUntil && (
                    <Badge
                      variant="secondary"
                      className="ml-2 text-xs"
                      data-testid={`muted-badge-${category}`}
                    >
                      Muted until {formatMutedUntil(pref.mutedUntil)}
                    </Badge>
                  )}
                </div>
              </div>

              {/* In-App toggle */}
              <div className="flex items-center justify-center">
                <Switch
                  checked={pref.inApp}
                  onCheckedChange={(v) => handleToggle(category, "inApp", v)}
                  disabled={isMutating}
                  aria-label={`Enable in-app notifications for ${meta.label}`}
                  data-testid={`toggle-inApp-${category}`}
                />
              </div>

              {/* Email toggle */}
              <div className="flex items-center justify-center">
                <Switch
                  checked={pref.email}
                  onCheckedChange={(v) => handleToggle(category, "email", v)}
                  disabled={isMutating}
                  aria-label={`Enable email notifications for ${meta.label}`}
                  data-testid={`toggle-email-${category}`}
                />
              </div>

              {/* Telegram toggle */}
              <div className="flex items-center justify-center">
                <Switch
                  checked={pref.telegram}
                  onCheckedChange={(v) =>
                    handleToggle(category, "telegram", v)
                  }
                  disabled={isMutating}
                  aria-label={`Enable telegram notifications for ${meta.label}`}
                  data-testid={`toggle-telegram-${category}`}
                />
              </div>

              {/* Min Severity */}
              <div className="flex items-center justify-center">
                <Select
                  value={pref.minSeverity ?? "all"}
                  onValueChange={(v) => handleSeverityChange(category, v)}
                  disabled={isMutating}
                >
                  <SelectTrigger
                    className="w-[100px] h-8 text-xs"
                    aria-label={`Minimum severity for ${meta.label}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS
                      .filter((opt) => category !== "credits" || opt.value !== "all")
                      .map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Mute/Snooze */}
              <div className="flex items-center justify-center">
                {muted ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleUnmute(category)}
                    className="text-xs"
                    data-testid={`unmute-${category}`}
                  >
                    <Volume2 className="w-3.5 h-3.5 mr-1" />
                    Unmute
                  </Button>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        data-testid={`mute-${category}`}
                      >
                        <VolumeX className="w-3.5 h-3.5 mr-1" />
                        Mute
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-1" align="end">
                      <div className="space-y-0.5">
                        {SNOOZE_DURATIONS.map((dur) => (
                          <button
                            key={dur.hours}
                            onClick={() => handleSnooze(category, dur.hours)}
                            className="w-full text-left px-3 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors"
                            data-testid={`snooze-${dur.hours}h-${category}`}
                          >
                            {dur.label}
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Webhook Management Section */}
      {webhookEnabled && (
        <div className="mt-8 border-t pt-6">
          <WebhookManagement scope="user" />
        </div>
      )}
    </div>
  );
}
