import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Presentation, StickyNote, Image } from "lucide-react";

interface DeckPreviewContentProps {
  data: {
    title: string;
    description: string | null;
    language: "auto" | "en" | "th";
    stylePreset: string | null;
    slides: Array<{
      templateId: string;
      title: string;
      body: string[];
      notes?: string;
      graphicCategory: string;
      imagePromptKeywords: string;
    }>;
  };
}

const languageLabels: Record<string, string> = {
  auto: "Auto",
  en: "English",
  th: "Thai",
};

export function DeckPreviewContent({ data }: DeckPreviewContentProps) {
  return (
    <div className="space-y-4">
      {/* Description */}
      {data.description && (
        <p className="text-sm leading-relaxed text-foreground/80">
          {data.description}
        </p>
      )}

      {/* Meta row */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="gap-1">
          <Presentation className="h-3 w-3" />
          {data.slides.length} slides
        </Badge>
        <Badge variant="outline">
          {languageLabels[data.language] ?? data.language}
        </Badge>
        {data.stylePreset && (
          <Badge variant="outline">{data.stylePreset}</Badge>
        )}
      </div>

      {/* Slides */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.slides.map((slide, i) => (
          <div
            key={i}
            className="rounded-xl border bg-background p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-100 text-xs font-bold text-indigo-700">
                  {i + 1}
                </div>
                <h4 className="text-sm font-semibold leading-tight">
                  {slide.title || `Slide ${i + 1}`}
                </h4>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {slide.templateId.replace(/_/g, " ")}
              </Badge>
            </div>

            {slide.body.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-foreground/70">
                {slide.body.slice(0, 4).map((line, j) => (
                  <li key={j} className="truncate">
                    &#8226; {line}
                  </li>
                ))}
                {slide.body.length > 4 && (
                  <li className="text-muted-foreground">
                    +{slide.body.length - 4} more...
                  </li>
                )}
              </ul>
            )}

            {(slide.notes || slide.graphicCategory) && (
              <>
                <Separator className="my-2" />
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  {slide.notes && (
                    <span className="flex items-center gap-1">
                      <StickyNote className="h-2.5 w-2.5" />
                      {slide.notes.length > 60
                        ? slide.notes.slice(0, 60) + "..."
                        : slide.notes}
                    </span>
                  )}
                  {slide.graphicCategory && (
                    <span className="flex items-center gap-1">
                      <Image className="h-2.5 w-2.5" />
                      {slide.graphicCategory}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
