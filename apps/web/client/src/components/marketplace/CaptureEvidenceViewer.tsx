type CaptureAsset = {
  id: string;
  kind: string;
  section?: string | null;
  url: string;
  contentType?: string | null;
  byteSize?: number | null;
};

export function CaptureEvidenceViewer({
  assets,
  rawDomText,
  rawJson,
  highlightedSource,
}: {
  assets: CaptureAsset[];
  rawDomText?: string | null;
  rawJson?: unknown;
  highlightedSource?: string | null;
}) {
  const normalizedHighlight = String(highlightedSource ?? "").toLowerCase();
  const isHighlighted = (asset: CaptureAsset) => {
    if (!normalizedHighlight) return false;
    return normalizedHighlight.includes(String(asset.id).toLowerCase())
      || normalizedHighlight.includes(String(asset.kind).toLowerCase())
      || (asset.section ? normalizedHighlight.includes(String(asset.section).toLowerCase()) : false);
  };

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Evidence Viewer</h2>
      {highlightedSource ? (
        <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
          Selected evidence source: {highlightedSource}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {assets.map((asset) => (
          <figure
            key={asset.id}
            className={`rounded-md border bg-slate-50 p-3 ${isHighlighted(asset) ? "border-blue-400 ring-2 ring-blue-100" : ""}`}
          >
            {String(asset.contentType ?? "").startsWith("image/") ? (
              <img src={asset.url} alt={asset.section ?? asset.kind} className="max-h-64 w-full object-contain" />
            ) : (
              <a className="text-sm text-blue-700 underline" href={asset.url} target="_blank" rel="noreferrer">
                Open asset
              </a>
            )}
            <figcaption className="mt-2 text-xs text-slate-600">
              {asset.kind} | {asset.section ?? "general"} | {asset.byteSize ?? 0} bytes
            </figcaption>
          </figure>
        ))}
        {assets.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มี asset evidence</p> : null}
      </div>

      <h3 className="mt-6 text-sm font-semibold">Raw DOM text</h3>
      <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{rawDomText || "-"}</pre>

      <h3 className="mt-6 text-sm font-semibold">Raw JSON</h3>
      <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(rawJson ?? {}, null, 2)}</pre>
    </section>
  );
}
