export function CandidateScoreBadge({ score }: { score: number | null | undefined }) {
  const value = Math.max(0, Math.min(100, Number(score ?? 0)));
  const tone = value >= 80
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : value >= 50
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${tone}`}>
      Score {value}
    </span>
  );
}
