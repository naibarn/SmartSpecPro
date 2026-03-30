import { useState } from "react";
import { useLocation } from "wouter";
import {
  BookOpen,
  ChevronRight,
  Search,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Input } from "@/components/ui/input";
import { LocaleToggle } from "@/components/LocaleToggle";
import { trpc } from "@/lib/trpc";
import { useHelpSearch } from "@/components/help/useHelpSearch";
import { useScopedTranslation } from "@/i18n/useScopedTranslation";

type LucideIcon = React.ComponentType<{ className?: string; size?: number }>;

function getIcon(name: string): LucideIcon {
  const icons = LucideIcons as Record<string, unknown>;
  return (icons[name] as LucideIcon) || BookOpen;
}

export default function Help() {
  const { t, locale } = useScopedTranslation('help');
  const [, navigate] = useLocation();

  const { data: manifest } = trpc.help.getManifest.useQuery(
    { locale: locale as "en" | "th" },
    { staleTime: 5 * 60 * 1000 },
  );

  const { query, search, results } = useHelpSearch(locale);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <BookOpen className="mx-auto mb-3 h-12 w-12 text-sky-500" />
        <h1 className="text-3xl font-bold">
          {t('center.title')}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t('center.subtitle')}
        </p>
        <div className="mt-3 flex justify-center">
          <LocaleToggle />
        </div>
      </div>

      {/* Search */}
      <div className="mx-auto mb-8 max-w-xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('center.searchPlaceholder')}
            value={query}
            onChange={(e) => search(e.target.value)}
            className="h-12 pl-10 text-base"
          />
        </div>
      </div>

      {/* Search results */}
      {query.trim() && (
        <div className="mx-auto max-w-xl">
          {results.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              {t('center.noResults')}
            </p>
          ) : (
            <div className="space-y-2">
              {results.map((item) => (
                <button
                  key={item.slug}
                  onClick={() => navigate(`/help/${item.slug}`)}
                  className="w-full rounded-lg border px-4 py-3 text-left transition-colors hover:bg-accent"
                >
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Topic grid by section */}
      {!query.trim() && manifest && (
        <div className="space-y-8">
          {manifest.sections.map((section) => {
            const sectionTopics = manifest.topics.filter(
              (t) => t.section === section.id,
            );
            if (sectionTopics.length === 0) return null;
            return (
              <div key={section.id}>
                <h2 className="mb-4 text-xl font-semibold">
                  {section.label[locale] || section.label.en}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {sectionTopics.map((topic) => {
                    const Icon = getIcon(topic.icon);
                    return (
                      <button
                        key={topic.slug}
                        onClick={() => navigate(`/help/${topic.slug}`)}
                        className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
                      >
                        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-sky-500" />
                        <div className="flex-1">
                          <p className="font-medium">{topic.title}</p>
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                            {topic.description}
                          </p>
                        </div>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
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
  );
}
