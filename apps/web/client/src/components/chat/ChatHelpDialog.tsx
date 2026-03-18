import { useState } from "react";
import {
  Bot,
  Brain,
  ChevronDown,
  Database,
  FileText,
  Film,
  FolderOpen,
  Globe,
  HelpCircle,
  ImagePlus,
  Lightbulb,
  MonitorPlay,
  Presentation,
  ReceiptText,
  Save,
  Settings,
  Sparkles,
  Users,
  Wand2,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useI18n, AVAILABLE_LOCALES, LOCALE_LABELS } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

/* ─── Static data (not translatable — icons, colors, keys) ───── */

/* Trigger phrases are locale-dependent — stored in translation files. */

const PRESENTATION_PARAM_KEYS = ["topic", "slides", "aspect", "language"] as const;
const PRESENTATION_PARAM_REQUIRED: Record<string, boolean> = { topic: true };

const PRESENTATION_EXAMPLE_KEYS = [
  "basic",
  "count",
  "portrait",
  "landscape",
  "lang",
  "full",
] as const;

const SKILL_TIP_KEYS = ["tip1", "tip2", "tip3", "tip4"] as const;

const AGENCY_TEMPLATE_META = [
  { key: "research", icon: FileText },
  { key: "storyboard", icon: Film },
  { key: "deck", icon: Presentation },
  { key: "comparison", icon: ReceiptText },
] as const;

const AGENCY_PREVIEW_STATES = [
  { key: "ready", color: "bg-blue-100 text-blue-800" },
  { key: "saving", color: "bg-slate-100 text-slate-700" },
  { key: "committed", color: "bg-green-100 text-green-800" },
  { key: "failed", color: "bg-red-100 text-red-800" },
  { key: "expired", color: "bg-amber-100 text-amber-800" },
] as const;

const AGENCY_COMMIT_KEYS = ["research", "deck"] as const;

const MEMORY_TYPE_KEYS = [
  "rule", "user", "project", "preference", "technical",
  "decision", "plan", "architecture", "task",
] as const;

/* ─── Component ──────────────────────────────────────────────── */

interface ChatHelpDialogProps {
  buttonClassName?: string;
  buttonLabel?: string;
  buttonSize?: "default" | "sm" | "lg" | "icon";
  buttonVariant?: "default" | "secondary" | "outline" | "ghost" | "link";
}

export function ChatHelpDialog({
  buttonClassName,
  buttonLabel = "Help",
  buttonSize = "sm",
  buttonVariant = "ghost",
}: ChatHelpDialogProps) {
  const [open, setOpen] = useState(false);
  const { t, locale, setLocale } = useI18n();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={buttonVariant}
        size={buttonSize}
        className={buttonClassName}
        onClick={() => setOpen(true)}
      >
        <HelpCircle className="h-4 w-4" />
        {buttonLabel}
      </Button>
      <DialogContent className="sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              {t("help.title")}
            </DialogTitle>

            {/* ── Language toggle ── */}
            <div className="flex items-center gap-1 shrink-0">
              <Globe className="h-3.5 w-3.5 text-slate-400" />
              {AVAILABLE_LOCALES.map((loc: Locale) => (
                <Button
                  key={loc}
                  type="button"
                  variant={locale === loc ? "default" : "outline"}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setLocale(loc)}
                >
                  {LOCALE_LABELS[loc]}
                </Button>
              ))}
            </div>
          </div>
          <DialogDescription>{t("help.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-slate-700">
          {/* ── What Chat is best for ── */}
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              {t("help.chatBestFor.title")}
            </h3>
            <p className="mt-2">{t("help.chatBestFor.body")}</p>
          </section>

          {/* ── Chat basics ── */}
          <CollapsibleSection title={t("help.chatBasics.title")}>
            <TBulletList t={t} prefix="help.chatBasics" count={4} />
          </CollapsibleSection>

          {/* ── Skills ── */}
          <CollapsibleSection title={t("help.skills.title")} icon={Wand2}>
            <TBulletList t={t} prefix="help.skills" count={4} />
          </CollapsibleSection>

          {/* ── Media ── */}
          <CollapsibleSection title={t("help.media.title")} icon={ImagePlus}>
            <TBulletList t={t} prefix="help.media" count={5} />
          </CollapsibleSection>

          {/* ── Presentation from Chat ── */}
          <CollapsibleSection
            title={t("help.presentation.title")}
            icon={Presentation}
            accent="sky"
          >
            <p className="text-sm text-slate-600 mb-4">
              {t("help.presentation.intro")}
            </p>

            {/* Trigger phrases */}
            <div className="rounded-lg border border-sky-100 bg-white p-3 space-y-2 mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                {t("help.presentation.triggers.title")}
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {t("help.presentation.triggers.list").split(",").map((phrase) => (
                  <Badge
                    key={phrase}
                    variant="outline"
                    className="text-[11px] font-mono"
                  >
                    {phrase}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Parameters table */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t("help.presentation.params.title")}
              </h4>
              <div className="rounded-lg border bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        {t("help.presentation.params.col.param")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        {t("help.presentation.params.col.required")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        {t("help.presentation.params.col.desc")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        {t("help.presentation.params.col.examples")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {PRESENTATION_PARAM_KEYS.map((pk) => (
                      <tr key={pk} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-medium">
                          {t(`help.presentation.params.${pk}.name`)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={
                              PRESENTATION_PARAM_REQUIRED[pk]
                                ? "default"
                                : "outline"
                            }
                            className="text-[10px]"
                          >
                            {PRESENTATION_PARAM_REQUIRED[pk]
                              ? t("help.presentation.required")
                              : t("help.presentation.optional")}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {t(`help.presentation.params.${pk}.desc`)}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
                          {t(`help.presentation.params.${pk}.examples`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Examples */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t("help.presentation.examples.title")}
              </h4>
              <div className="grid gap-2 md:grid-cols-2">
                {PRESENTATION_EXAMPLE_KEYS.map((ek) => (
                  <div
                    key={ek}
                    className="rounded-lg border bg-white p-3 space-y-1"
                  >
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {t(`help.presentation.ex.${ek}.label`)}
                    </Badge>
                    <p className="font-mono text-[11px] text-sky-700 break-all">
                      {t(`help.presentation.ex.${ek}.cmd`)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      &rarr; {t(`help.presentation.ex.${ek}.result`)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* How it works */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("help.presentation.howItWorks.title")}
              </h4>
              <ol className="list-decimal space-y-1.5 pl-5 text-xs text-slate-600">
                {[1, 2, 3, 4, 5].map((n) => (
                  <li key={n}>
                    {t(`help.presentation.howItWorks.${n}`)}
                  </li>
                ))}
              </ol>
            </div>
          </CollapsibleSection>

          {/* ── Auto Skill Detection ── */}
          <CollapsibleSection
            title={t("help.skillDetection.title")}
            icon={Sparkles}
            accent="emerald"
          >
            <TBulletList t={t} prefix="help.skillDetection" count={4} />

            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t("help.skillDetection.tips.title")}
              </h4>
              <div className="grid gap-2 md:grid-cols-2">
                {SKILL_TIP_KEYS.map((tk) => (
                  <div
                    key={tk}
                    className="rounded-lg border bg-white p-3 space-y-1.5"
                  >
                    <p className="font-semibold text-xs text-slate-900">
                      {t(`help.skillDetection.${tk}.title`)}
                    </p>
                    <p className="font-mono text-[11px] text-emerald-700">
                      {t(`help.skillDetection.${tk}.example`)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {t(`help.skillDetection.${tk}.why`)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("help.skillDetection.howItWorks.title")}
              </h4>
              <ol className="list-decimal space-y-1.5 pl-5 text-xs text-slate-600">
                {[1, 2, 3, 4, 5].map((n) => (
                  <li key={n}>
                    {t(`help.skillDetection.howItWorks.${n}`)}
                  </li>
                ))}
              </ol>
            </div>
          </CollapsibleSection>

          {/* ── Memory (Expanded) ── */}
          <CollapsibleSection
            title={t("help.memory.title")}
            icon={Brain}
            accent="violet"
          >
            <p className="text-sm text-slate-600 mb-4">
              {t("help.memory.intro")}
            </p>

            {/* What Memory stores */}
            <MemorySubSection
              title={t("help.memory.what.title")}
              icon={Database}
            >
              <TBulletList t={t} prefix="help.memory.what" count={5} />
            </MemorySubSection>

            {/* Memory modes */}
            <MemorySubSection
              title={t("help.memory.modes.title")}
              icon={Settings}
            >
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {(["full", "nolong", "off"] as const).map((mode) => (
                  <div key={mode} className="rounded-lg border bg-white p-3 space-y-1">
                    <p className="font-semibold text-xs text-slate-900">
                      {t(`help.memory.modes.${mode}.name`)}
                    </p>
                    <p className="text-[11px] text-slate-600">
                      {t(`help.memory.modes.${mode}.desc`)}
                    </p>
                  </div>
                ))}
              </div>
            </MemorySubSection>

            {/* Memory types */}
            <MemorySubSection
              title={t("help.memory.types.title")}
              icon={FolderOpen}
            >
              <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                {MEMORY_TYPE_KEYS.map((tk) => (
                  <li key={tk} className="flex gap-2 items-start">
                    <span className="shrink-0 mt-0.5 h-1.5 w-1.5 rounded-full bg-violet-400" />
                    {t(`help.memory.types.${tk}`)}
                  </li>
                ))}
              </ul>
            </MemorySubSection>

            {/* Automatic memory */}
            <MemorySubSection
              title={t("help.memory.auto.title")}
              icon={Zap}
            >
              <TBulletList t={t} prefix="help.memory.auto" count={4} />
            </MemorySubSection>

            {/* Auto-summarization */}
            <MemorySubSection
              title={t("help.memory.summary.title")}
              icon={FileText}
            >
              <TBulletList t={t} prefix="help.memory.summary" count={4} />
            </MemorySubSection>

            {/* Projects and cross-chat */}
            <MemorySubSection
              title={t("help.memory.projects.title")}
              icon={FolderOpen}
            >
              <TBulletList t={t} prefix="help.memory.projects" count={3} />
            </MemorySubSection>

            {/* Managing memories */}
            <MemorySubSection
              title={t("help.memory.manage.title")}
              icon={Settings}
            >
              <TBulletList t={t} prefix="help.memory.manage" count={4} />
            </MemorySubSection>

            {/* Tips */}
            <MemorySubSection
              title={t("help.memory.tips.title")}
              icon={Lightbulb}
            >
              <TBulletList t={t} prefix="help.memory.tips" count={4} />
            </MemorySubSection>
          </CollapsibleSection>

          {/* ── Browser Session ── */}
          <CollapsibleSection title={t("help.browser.title")} icon={MonitorPlay}>
            <TBulletList t={t} prefix="help.browser" count={3} />
          </CollapsibleSection>

          <Separator />

          {/* ── Agencies ── */}
          <CollapsibleSection
            title={t("help.agencies.title")}
            icon={Users}
            accent="indigo"
          >
            <TBulletList t={t} prefix="help.agencies" count={4} />

            {/* Getting started */}
            <div className="mt-4 rounded-lg border border-indigo-100 bg-white p-3 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                {t("help.agencies.howToStart.title")}
              </h4>
              <ol className="list-decimal space-y-1.5 pl-5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <li key={n}>{t(`help.agencies.howToStart.${n}`)}</li>
                ))}
              </ol>
            </div>

            {/* Templates */}
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t("help.agencies.templates.title")}
              </h4>
              <div className="grid gap-2 md:grid-cols-2">
                {AGENCY_TEMPLATE_META.map(({ key, icon: TplIcon }) => (
                  <div
                    key={key}
                    className="rounded-lg border bg-white p-3 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <TplIcon className="h-4 w-4 text-indigo-600" />
                      <span className="font-semibold text-slate-900">
                        {t(`help.agencies.tpl.${key}.name`)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {t(`help.agencies.tpl.${key}.desc`)}
                    </p>
                    <p className="text-xs italic text-slate-400">
                      {t("common.example")}:{" "}
                      {t(`help.agencies.tpl.${key}.example`)}
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      {t("common.output")}:{" "}
                      {t(`help.agencies.tpl.${key}.output`)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview lifecycle */}
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t("help.agencies.preview.title")}
              </h4>
              <div className="space-y-1.5">
                {AGENCY_PREVIEW_STATES.map(({ key, color }) => (
                  <div
                    key={key}
                    className="flex items-start gap-2 rounded-lg border bg-white px-3 py-2"
                  >
                    <Badge className={`shrink-0 text-[10px] ${color}`}>
                      {t(`help.agencies.preview.${key}`)}
                    </Badge>
                    <span className="text-xs text-slate-600">
                      {t(`help.agencies.preview.${key}.desc`)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Commit actions */}
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t("help.agencies.commit.title")}
              </h4>
              <div className="rounded-lg border bg-white overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        {t("help.agencies.commit.col.type")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        {t("help.agencies.commit.col.button")}
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-700">
                        {t("help.agencies.commit.col.dest")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {AGENCY_COMMIT_KEYS.map((ck) => (
                      <tr key={ck} className="border-b last:border-b-0">
                        <td className="px-3 py-2">
                          {t(`help.agencies.commit.${ck}.type`)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1">
                            <Save className="h-3 w-3" />
                            {t(`help.agencies.commit.${ck}.button`)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {t(`help.agencies.commit.${ck}.dest`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dismiss & error */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("help.agencies.other.title")}
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">
                {[1, 2, 3].map((n) => (
                  <li key={n}>{t(`help.agencies.other.${n}`)}</li>
                ))}
              </ul>
            </div>
          </CollapsibleSection>

          {/* ── Common use cases ── */}
          <CollapsibleSection title={t("help.useCases.title")}>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  {t(`help.useCases.${n}`)}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Helpers ────────────────────────────────────────────────── */

const ACCENT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  sky: { border: "border-sky-200", bg: "bg-sky-50/40", text: "text-sky-700" },
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50/40", text: "text-emerald-700" },
  violet: { border: "border-violet-200", bg: "bg-violet-50/40", text: "text-violet-700" },
  indigo: { border: "border-indigo-200", bg: "bg-indigo-50/40", text: "text-indigo-700" },
};

/** A collapsible section with a chevron toggle. */
function CollapsibleSection({
  title,
  icon: Icon,
  accent,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: keyof typeof ACCENT_COLORS;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const colors = accent ? ACCENT_COLORS[accent] : undefined;
  return (
    <details
      className={`group rounded-xl border ${colors?.border ?? "border-slate-200"} ${colors?.bg ?? "bg-white"} overflow-hidden`}
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50/50 [&::-webkit-details-marker]:hidden list-none">
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
        {Icon && <Icon className={`h-4 w-4 ${colors?.text ?? "text-primary"}`} />}
        {title}
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

/** A sub-section inside the Memory section. */
function MemorySubSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border border-violet-100 bg-white p-3">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="h-3.5 w-3.5 text-violet-500" />}
        <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}

/** Renders a numbered bullet list from sequential translation keys. */
function TBulletList({
  t,
  prefix,
  count,
}: {
  t: (key: string) => string;
  prefix: string;
  count: number;
}) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>{t(`${prefix}.${i + 1}`)}</li>
      ))}
    </ul>
  );
}
