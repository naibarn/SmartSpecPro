import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import DOMPurify from "dompurify";
import { Input } from "@/components/ui/input";
import {
    type SvgGraphic,
    SVG_GRAPHICS,
    SVG_CATEGORIES,
} from "@shared/presentation/svgGraphicsCatalog";

export type { SvgGraphic } from "@shared/presentation/svgGraphicsCatalog";

interface GraphicsPanelProps {
    onInsertGraphic: (graphic: SvgGraphic) => void;
}

export function GraphicsPanel({ onInsertGraphic }: GraphicsPanelProps) {
    const [search, setSearch] = useState("");
    const [activeCategory, setActiveCategory] = useState<string>("All");

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        return SVG_GRAPHICS.filter((g) => {
            const matchCat = activeCategory === "All" || g.category === activeCategory;
            const matchQ = !q || g.label.toLowerCase().includes(q) || g.category.toLowerCase().includes(q);
            return matchCat && matchQ;
        });
    }, [search, activeCategory]);

    const categories = ["All", ...SVG_CATEGORIES];

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 text-slate-100">
            {/* Search */}
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search graphics..."
                    className="border-slate-700 bg-slate-950/70 pl-8 text-slate-100 placeholder:text-slate-500"
                />
            </div>

            {/* Category pills */}
            <div className="flex flex-wrap gap-1">
                {categories.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory(cat)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${activeCategory === cat
                                ? "bg-sky-500 text-white"
                                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                            }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div
                className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
                data-testid="graphics-panel-scroll-area"
            >
                {filtered.length === 0 ? (
                    <p className="text-sm text-slate-400">No graphics found.</p>
                ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                        {filtered.map((graphic) => (
                            <button
                                key={graphic.id}
                                type="button"
                                aria-label={`Insert ${graphic.label}`}
                                title={graphic.label}
                                onClick={() => onInsertGraphic(graphic)}
                                className="group flex aspect-square flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-2 transition-all hover:border-sky-500 hover:bg-slate-800"
                            >
                                <div
                                    className="h-8 w-8 text-slate-100 group-hover:text-sky-300 transition-colors"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(graphic.svg.replace(/currentColor/g, "currentColor"), { USE_PROFILES: { svg: true, svgFilters: true } }) }}
                                    style={{ color: "currentColor" }}
                                />
                                <span className="w-full truncate text-center text-[9px] text-slate-500 group-hover:text-slate-300">
                                    {graphic.label}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
