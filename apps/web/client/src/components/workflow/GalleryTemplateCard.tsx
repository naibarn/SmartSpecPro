import { Layers, Download, Clock, ArrowUpRight } from "lucide-react";
import {
  CATEGORY_COLOR_MAP,
  DEFAULT_CATEGORY_COLOR,
} from "./galleryConstants";

interface GalleryTemplateCardProps {
  template: {
    id: number;
    name: string;
    description: string | null;
    category?: string | null;
    stepCount: number | null;
    estimatedSetupMinutes: number | null;
    industry: string[] | null;
    tags: string[] | null;
    downloadCount: number | null;
    templateKey: string | null;
  };
  onSelect: (id: number) => void;
}

export function GalleryTemplateCard({
  template,
  onSelect,
}: GalleryTemplateCardProps) {
  const categoryColors = template.category
    ? CATEGORY_COLOR_MAP[template.category] ?? DEFAULT_CATEGORY_COLOR
    : DEFAULT_CATEGORY_COLOR;

  return (
    <article
      role="button"
      tabIndex={0}
      className="group relative flex flex-col rounded-xl border bg-white/80 backdrop-blur p-4 cursor-pointer transition-all hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-primary"
      onClick={() => onSelect(template.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(template.id);
        }
      }}
    >
      {/* Top row: category badge */}
      {template.category && (
        <span
          className={`self-start inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${categoryColors.bg} ${categoryColors.text}`}
        >
          {template.category}
        </span>
      )}

      {/* Title */}
      <h3 className="font-semibold text-sm line-clamp-1 mt-2">
        {template.name}
      </h3>

      {/* Description */}
      {template.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {template.description}
        </p>
      )}

      {/* Industry tags */}
      {template.industry && template.industry.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {template.industry.slice(0, 3).map((ind) => (
            <span
              key={ind}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground font-medium"
            >
              {ind}
            </span>
          ))}
        </div>
      )}

      {/* Bottom stats row */}
      <div className="mt-auto pt-3 flex items-center gap-3 text-xs text-muted-foreground border-t border-dashed">
        {template.stepCount != null && (
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {template.stepCount}
          </span>
        )}
        {template.estimatedSetupMinutes != null && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {template.estimatedSetupMinutes}m
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Download className="h-3 w-3" />
          {template.downloadCount ?? 0}
        </span>

        <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Preview
          <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </article>
  );
}
