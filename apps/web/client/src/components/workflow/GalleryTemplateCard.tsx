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
      className="group relative flex flex-col rounded-lg border bg-card p-4 cursor-pointer transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
      onClick={() => onSelect(template.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(template.id);
        }
      }}
    >
      <h3 className="font-semibold text-sm line-clamp-1">{template.name}</h3>

      {template.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {template.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {template.category && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors.bg} ${categoryColors.text}`}
          >
            {template.category}
          </span>
        )}

        {template.stepCount != null && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
            {template.stepCount} steps
          </span>
        )}
      </div>

      {template.industry && template.industry.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {template.industry.slice(0, 3).map((ind) => (
            <span
              key={ind}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted/50 text-muted-foreground"
            >
              {ind}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {template.downloadCount ?? 0} uses
        </span>
        <button
          className="text-xs font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(template.id);
          }}
        >
          Preview
        </button>
      </div>
    </article>
  );
}
