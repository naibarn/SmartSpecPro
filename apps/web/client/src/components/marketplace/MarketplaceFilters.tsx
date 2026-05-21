export interface MarketplaceFilterValue {
  keyword: string;
  minScore: string;
  minSold: string;
  priceMax: string;
  discountMin: string;
  mallOnly: boolean;
}

export function MarketplaceFilters({
  value,
  onChange,
}: {
  value: MarketplaceFilterValue;
  onChange: (value: MarketplaceFilterValue) => void;
}) {
  const update = (key: keyof MarketplaceFilterValue, next: string | boolean) => onChange({ ...value, [key]: next });
  return (
    <div className="grid gap-3 rounded-lg border bg-white p-4 shadow-sm md:grid-cols-3">
      <label className="text-sm font-medium">Keyword<input className="mt-1 w-full rounded-md border px-3 py-2" value={value.keyword} onChange={(e) => update("keyword", e.target.value)} /></label>
      <label className="text-sm font-medium">Min score<input className="mt-1 w-full rounded-md border px-3 py-2" value={value.minScore} onChange={(e) => update("minScore", e.target.value)} /></label>
      <label className="text-sm font-medium">Min sold<input className="mt-1 w-full rounded-md border px-3 py-2" value={value.minSold} onChange={(e) => update("minSold", e.target.value)} /></label>
      <label className="text-sm font-medium">Price max<input className="mt-1 w-full rounded-md border px-3 py-2" value={value.priceMax} onChange={(e) => update("priceMax", e.target.value)} /></label>
      <label className="text-sm font-medium">Discount min<input className="mt-1 w-full rounded-md border px-3 py-2" value={value.discountMin} onChange={(e) => update("discountMin", e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={value.mallOnly} onChange={(e) => update("mallOnly", e.target.checked)} /> Mall / official only</label>
    </div>
  );
}
