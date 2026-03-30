import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Facebook,
  MessageCircle,
  Megaphone,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import { useLocation } from "wouter";

import { LocaleToggle } from "@/components/LocaleToggle";
import { SocialBackButton } from "@/components/social/SocialBackButton";
import { cn } from "@/lib/utils";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

const SOCIAL_NAV_ITEMS = [
  { labelKey: "shell.nav.channels", path: "/social/channels", icon: Facebook },
  { labelKey: "shell.nav.inbox", path: "/social/inbox", icon: MessageCircle },
  { labelKey: "shell.nav.publishing", path: "/social/publishing", icon: Megaphone },
  { labelKey: "shell.nav.moderation", path: "/social/moderation", icon: ShieldAlert },
  { labelKey: "shell.nav.automation", path: "/social/automation", icon: Workflow },
] as const;

type SocialPageShellProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  eyebrow?: string;
  tone?: "channels" | "inbox" | "publishing" | "moderation" | "automation";
  badge?: ReactNode;
  actions?: ReactNode;
  hero?: ReactNode;
  children: ReactNode;
};

const TONE_STYLES: Record<NonNullable<SocialPageShellProps["tone"]>, {
  shell: string;
  iconBg: string;
  activeNav: string;
  eyebrow: string;
}> = {
  channels: {
    shell: "bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.14),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_45%,_#eff6ff_100%)]",
    iconBg: "bg-sky-600",
    activeNav: "border-sky-600 bg-sky-600 text-white shadow-lg shadow-sky-200/60",
    eyebrow: "text-sky-700",
  },
  inbox: {
    shell: "bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_45%,_#ecfeff_100%)]",
    iconBg: "bg-cyan-600",
    activeNav: "border-cyan-600 bg-cyan-600 text-white shadow-lg shadow-cyan-200/60",
    eyebrow: "text-cyan-700",
  },
  publishing: {
    shell: "bg-[radial-gradient(circle_at_top_left,_rgba(217,70,239,0.14),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_45%,_#fdf2f8_100%)]",
    iconBg: "bg-fuchsia-600",
    activeNav: "border-fuchsia-600 bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-200/60",
    eyebrow: "text-fuchsia-700",
  },
  moderation: {
    shell: "bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_45%,_#f0fdf4_100%)]",
    iconBg: "bg-emerald-600",
    activeNav: "border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-200/60",
    eyebrow: "text-emerald-700",
  },
  automation: {
    shell: "bg-[radial-gradient(circle_at_top_left,_rgba(168,85,247,0.14),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_45%,_#f5f3ff_100%)]",
    iconBg: "bg-violet-600",
    activeNav: "border-violet-600 bg-violet-600 text-white shadow-lg shadow-violet-200/60",
    eyebrow: "text-violet-700",
  },
};

export function SocialPageShell({
  icon: Icon,
  title,
  description,
  eyebrow,
  tone = "channels",
  badge,
  actions,
  hero,
  children,
}: SocialPageShellProps) {
  const { t } = useScopedTranslation("social");
  const [location, setLocation] = useLocation();
  const theme = TONE_STYLES[tone];
  const accentBarClass = {
    channels: "from-sky-400 via-sky-600 to-cyan-300",
    inbox: "from-cyan-400 via-cyan-600 to-teal-300",
    publishing: "from-fuchsia-400 via-fuchsia-600 to-pink-300",
    moderation: "from-emerald-400 via-emerald-600 to-lime-300",
    automation: "from-violet-400 via-violet-600 to-purple-300",
  }[tone];

  return (
    <div className={`flex min-h-screen flex-col ${theme.shell}`}>
      <div className="mx-auto w-full max-w-[1600px] px-4 pt-4">
        <SocialBackButton />
      </div>

      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-4 py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-lg shadow-slate-300/40 ${theme.iconBg}`}>
              <Icon className="h-6 w-6" />
            </div>
            <div>
              {eyebrow ? (
                <div className={`text-xs font-semibold uppercase tracking-[0.22em] ${theme.eyebrow}`}>
                  {eyebrow}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
                {badge}
              </div>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                {description}
              </p>
            </div>
          </div>

          {actions ? (
            <div className="flex flex-wrap items-center gap-3">
              {actions}
            </div>
          ) : null}
          <LocaleToggle className="hidden sm:inline-flex" />
        </div>
      </header>

      <div className="border-b border-slate-200/70 bg-white/60 backdrop-blur">
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {t("shell.workspace")}
            </span>
            {SOCIAL_NAV_ITEMS.map((item) => {
              const isActive = location === item.path;
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => setLocation(item.path)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition",
                    isActive
                      ? theme.activeNav
                      : "border-slate-200 bg-white/90 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 py-4">
        {hero ? (
          <section className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/82 p-5 shadow-lg shadow-slate-200/50 backdrop-blur">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,255,255,0.72),rgba(255,255,255,0.95))]" />
            <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/30 blur-3xl" />
            <div className={`absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r ${accentBarClass}`} />
            <div className="relative">
              {hero}
            </div>
          </section>
        ) : null}
        {children}
      </main>
    </div>
  );
}
