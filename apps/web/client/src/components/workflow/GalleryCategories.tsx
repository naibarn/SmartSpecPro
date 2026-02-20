interface GalleryCategoriesProps {
  categories: Array<{ id: number; name: string; templateCount: number }>;
  totalCount: number;
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
  isLoading: boolean;
}

export function GalleryCategories({
  categories,
  totalCount,
  selectedCategory,
  onSelect,
  isLoading,
}: GalleryCategoriesProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 rounded-md bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
          selectedCategory === null
            ? "bg-blue-50 text-blue-700 font-semibold"
            : "hover:bg-muted"
        }`}
        onClick={() => onSelect(null)}
      >
        <span>All</span>
        <span className="text-xs text-muted-foreground">({totalCount})</span>
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
            selectedCategory === cat.name
              ? "bg-blue-50 text-blue-700 font-semibold"
              : "hover:bg-muted"
          }`}
          onClick={() => onSelect(cat.name)}
        >
          <span>{cat.name}</span>
          <span className="text-xs text-muted-foreground">
            ({cat.templateCount})
          </span>
        </button>
      ))}
    </div>
  );
}
