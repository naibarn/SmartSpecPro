import { useState, useCallback } from "react";
import {
  ArrowLeft,
  BookOpen,
  Camera,
  ChevronRight,
  ExternalLink,
  Loader2,
  Search,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { HelpTopicRenderer } from "./HelpTopicRenderer";
import { useHelpSearch } from "./useHelpSearch";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type LucideIcon = React.ComponentType<{ className?: string; size?: number }>;

function getIcon(name: string): LucideIcon {
  const icons = LucideIcons as Record<string, unknown>;
  return (icons[name] as LucideIcon) || BookOpen;
}

interface HelpPanelProps {
  initialPage?: string;
  initialTopic?: string;
}

export function HelpPanel({ initialPage, initialTopic }: HelpPanelProps) {
  const { t, locale } = useScopedTranslation('help');
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTopic, setActiveTopic] = useState<string | null>(
    initialTopic ?? null,
  );
  const [showCapture, setShowCapture] = useState(false);
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureStep, setCaptureStep] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);

  const captureScreenshot = trpc.help.captureScreenshot.useMutation();

  const { data: manifest } = trpc.help.getManifest.useQuery(
    { locale: locale as "en" | "th" },
    { staleTime: 5 * 60 * 1000 },
  );

  const { data: contextualTopics } = trpc.help.getContextualTopics.useQuery(
    { page: initialPage ?? "/", locale: locale as "en" | "th" },
    { staleTime: 5 * 60 * 1000, enabled: !activeTopic && !!initialPage },
  );

  const { data: topicData } = trpc.help.getTopic.useQuery(
    { slug: activeTopic ?? "", locale: locale as "en" | "th" },
    { staleTime: 5 * 60 * 1000, enabled: !!activeTopic },
  );

  const { query, search, results } = useHelpSearch(locale);

  const handleTopicClick = useCallback(
    (slug: string) => {
      setActiveTopic(slug);
      search("");
    },
    [search],
  );

  const handleBack = useCallback(() => {
    setActiveTopic(null);
  }, []);

  // ── Shared: Search bar ──
  const searchBar = (
    <div className="shrink-0 border-b px-4 py-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('center.searchPlaceholder')}
          value={query}
          onChange={(e) => search(e.target.value)}
          className="h-8 pl-9 text-sm"
        />
      </div>
    </div>
  );

  // ── Shared: Search results ──
  const searchResults = query.trim() ? (
    <div className="px-4 py-3">
      {results.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {t('center.noResults')}
        </p>
      ) : (
        <div className="space-y-1">
          {results.map((item) => (
            <button
              key={item.slug}
              onClick={() => handleTopicClick(item.slug)}
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-accent"
            >
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {item.description}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  // ═══════════════════════════════════════════════════
  // Topic detail view
  // ═══════════════════════════════════════════════════
  if (activeTopic && topicData) {
    const Icon = getIcon(topicData.icon);
    return (
      <div className="flex h-full flex-col">
        {/* Topic header */}
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Icon className="h-4 w-4 text-sky-500" />
          <h2 className="flex-1 truncate text-sm font-semibold">
            {topicData.title}
          </h2>
          <LocaleToggle />
        </div>

        {/* Search (always visible) */}
        {searchBar}

        {/* Show search results OR topic content */}
        {searchResults || (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <HelpTopicRenderer html={topicData.html} />

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={`/help/${activeTopic}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-sky-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t('center.openFullPage')}
              </a>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => setShowCapture(!showCapture)}
                >
                  <Camera className="h-3 w-3" />
                  {t('center.screenshot')}
                </Button>
              )}
            </div>

            {/* Admin screenshot capture form */}
            {isAdmin && showCapture && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <p className="mb-3 text-xs font-medium">
                  {t('center.captureForm.title')}
                </p>
                <div className="space-y-2">
                  <Input
                    placeholder="URL (e.g. https://smartaihub.app/chat)"
                    value={captureUrl}
                    onChange={(e) => setCaptureUrl(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="Step name (e.g. model-picker)"
                    value={captureStep}
                    onChange={(e) =>
                      setCaptureStep(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, "-"),
                      )
                    }
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="w-full gap-1"
                    disabled={!captureUrl || !captureStep || isCapturing}
                    onClick={async () => {
                      setIsCapturing(true);
                      try {
                        const result =
                          await captureScreenshot.mutateAsync({
                            url: captureUrl,
                            featureName: activeTopic!,
                            step: captureStep,
                          });
                        await navigator.clipboard.writeText(
                          result.markdown,
                        );
                        toast.success(t('center.captureForm.successMsg'));
                        setCaptureUrl("");
                        setCaptureStep("");
                      } catch {
                        toast.error(t('center.captureForm.errorMsg'));
                      } finally {
                        setIsCapturing(false);
                      }
                    }}
                  >
                    {isCapturing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Camera className="h-3 w-3" />
                    )}
                    {isCapturing ? t('center.captureForm.capturing') : t('center.captureForm.capture')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // Browse / search view
  // ═══════════════════════════════════════════════════
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-semibold">
          {t('center.title')}
        </h2>
        <LocaleToggle />
      </div>

      {/* Search */}
      {searchBar}

      {/* Content */}
      {searchResults || (
        <div className="flex-1 overflow-y-auto">
          {/* Contextual topics */}
          {contextualTopics && contextualTopics.length > 0 && (
            <div className="px-4 py-3">
              <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                {t('center.forThisPage')}
              </p>
              <div className="space-y-1">
                {contextualTopics.map((topic) => {
                  const Icon = getIcon(topic.icon);
                  return (
                    <button
                      key={topic.slug}
                      onClick={() => handleTopicClick(topic.slug)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent"
                    >
                      <Icon className="h-4 w-4 text-sky-500" />
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium">{topic.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {topic.description}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
              <Separator className="mt-3" />
            </div>
          )}

          {/* All topics by section */}
          {manifest && (
            <div className="px-4 pb-4">
              {manifest.sections.map((section) => {
                const sectionTopics = manifest.topics.filter(
                  (t) => t.section === section.id,
                );
                if (sectionTopics.length === 0) return null;
                return (
                  <div key={section.id} className="mb-4">
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                      {section.label[locale] || section.label.en}
                    </p>
                    <div className="space-y-1">
                      {sectionTopics.map((topic) => {
                        const Icon = getIcon(topic.icon);
                        return (
                          <button
                            key={topic.slug}
                            onClick={() => handleTopicClick(topic.slug)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent"
                          >
                            <Icon className="h-4 w-4 text-sky-500" />
                            <div className="flex-1 text-left">
                              <p className="text-sm font-medium">
                                {topic.title}
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {topic.description}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
