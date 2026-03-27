import { useRoute, useLocation } from "wouter";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocaleToggle } from "@/components/LocaleToggle";
import { trpc } from "@/lib/trpc";
import { HelpTopicRenderer } from "@/components/help/HelpTopicRenderer";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type LucideIcon = React.ComponentType<{ className?: string; size?: number }>;

function getIcon(name: string): LucideIcon {
  const icons = LucideIcons as Record<string, unknown>;
  return (icons[name] as LucideIcon) || BookOpen;
}

export default function HelpTopic() {
  const { locale } = useScopedTranslation('help');
  const [, navigate] = useLocation();
  const [, params] = useRoute("/help/:slug+");
  const slug = params?.["slug+"] ?? "";

  const { data: topic, isLoading } = trpc.help.getTopic.useQuery(
    { slug, locale: locale as "en" | "th" },
    { staleTime: 5 * 60 * 1000, enabled: !!slug },
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <BookOpen className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
        <h1 className="text-2xl font-bold">
          {locale === "th" ? "ไม่พบเอกสาร" : "Topic not found"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {locale === "th"
            ? "เอกสารที่คุณค้นหาไม่มีในระบบ"
            : "The help topic you're looking for doesn't exist."}
        </p>
        <Button className="mt-4" onClick={() => navigate("/help")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {locale === "th" ? "กลับไปศูนย์ช่วยเหลือ" : "Back to Help Center"}
        </Button>
      </div>
    );
  }

  const Icon = getIcon(topic.icon);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <button
          onClick={() => navigate("/help")}
          className="hover:text-foreground"
        >
          {locale === "th" ? "ศูนย์ช่วยเหลือ" : "Help Center"}
        </button>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{topic.title}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8 text-sky-500" />
          <div>
            <h1 className="text-2xl font-bold">{topic.title}</h1>
            <p className="text-muted-foreground">{topic.description}</p>
          </div>
        </div>
        <LocaleToggle />
      </div>

      {/* Content */}
      <div className="rounded-lg border p-6">
        <HelpTopicRenderer html={topic.html} />
      </div>

      {/* Back */}
      <div className="mt-6">
        <Button variant="ghost" onClick={() => navigate("/help")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {locale === "th" ? "กลับไปศูนย์ช่วยเหลือ" : "Back to Help Center"}
        </Button>
      </div>
    </div>
  );
}
