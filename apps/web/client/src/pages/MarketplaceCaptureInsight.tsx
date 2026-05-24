import { useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

function getInsightId(pathname: string) {
  return pathname.match(/\/marketplace-capture\/insights\/([^/]+)/)?.[1] ?? "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const STORY_OPTION_ORDER = [
  "story_option:problem_solution",
  "story_option:objection_trust",
  "story_option:quick_demo",
  "story_option:use_case_moment",
];

const STORY_OPTION_TITLE_ORDER = [
  "ปัญหา → ทางออก",
  "ข้อกังวล → ความมั่นใจ",
  "เดโมเร็ว / รวมประโยชน์",
  "สถานการณ์ใช้งานจริง",
];

type StoryOption = {
  id?: string;
  title?: string;
  audience?: string;
  customerNeed?: string;
  problemToSolve?: string;
  useCase?: string;
  hook?: string;
  confidence?: number;
  autoSelected?: boolean;
  storyboardOutline?: string[];
  videoBrief?: {
    structureLabel?: string;
    durationSec?: number;
    aspectRatio?: string;
    shots?: Array<{ order?: number; startSec?: number; endSec?: number; title?: string; videoPrompt?: string; subShots?: string[]; thaiVoiceover?: string }>;
  };
};

function compactText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function storyOptionKey(option: StoryOption) {
  return compactText(option.id, compactText(option.title));
}

function storyOptionRank(option: StoryOption) {
  const idRank = STORY_OPTION_ORDER.indexOf(compactText(option.id));
  if (idRank >= 0) return idRank;
  const titleRank = STORY_OPTION_TITLE_ORDER.indexOf(compactText(option.title));
  return titleRank >= 0 ? titleRank : 99;
}

function hasCompleteVideoBrief(option: StoryOption) {
  const shots = Array.isArray(option.videoBrief?.shots) ? option.videoBrief.shots : [];
  return shots.length >= 3 && shots.slice(0, 3).every((shot) => compactText(shot.videoPrompt) && compactText(shot.thaiVoiceover));
}

function normalizeStoryOptions(value: unknown): StoryOption[] {
  const seen = new Map<string, StoryOption>();
  for (const option of Array.isArray(value) ? value as StoryOption[] : []) {
    const key = storyOptionKey(option);
    if (!key) continue;
    const existing = seen.get(key);
    if (existing && (hasCompleteVideoBrief(existing) || !hasCompleteVideoBrief(option))) continue;
    seen.set(key, option);
  }
  return Array.from(seen.values())
    .sort((a, b) => {
      const rankDiff = storyOptionRank(a) - storyOptionRank(b);
      if (rankDiff !== 0) return rankDiff;
      return Number(b.autoSelected) - Number(a.autoSelected) || Number(b.confidence ?? 0) - Number(a.confidence ?? 0);
    })
    .slice(0, 4);
}

function orderedShots(option: StoryOption) {
  return (option.videoBrief?.shots ?? [])
    .slice()
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .slice(0, 3);
}

function dedupeSelectedImages(value: unknown) {
  return Array.from(new Map((Array.isArray(value) ? value as Array<{ url?: string; role?: string; fidelity?: string }> : [])
    .filter((image) => image.url)
    .map((image) => [String(image.url), image])).values());
}

export default function MarketplaceCaptureInsight() {
  const [location] = useLocation();
  const insightId = getInsightId(location);
  const utils = trpc.useUtils();
  const insightQuery = trpc.marketplaceCapture.getInsight.useQuery({ insightId }, { enabled: Boolean(insightId) });
  const resolveClaim = trpc.marketplaceCapture.resolveInsightClaim.useMutation({
    onSuccess: () => utils.marketplaceCapture.getInsight.invalidate({ insightId }),
  });
  const insight = insightQuery.data as any;
  const payload = useMemo(() => (insight?.payloadJson ?? {}) as any, [insight]);
  const claims = asArray(payload.claims) as Array<{ id?: string; text?: string; status?: string; evidenceIds?: string[] }>;
  const evidenceIds = asArray(payload.evidenceIds);
  const selectedImages = useMemo(() => dedupeSelectedImages(payload.selectedImages), [payload.selectedImages]);
  const storyOptions = useMemo(() => normalizeStoryOptions(payload.storyOptions), [payload.storyOptions]);

  if (insightQuery.isLoading) return <main className="p-8">Loading insight...</main>;
  if (!insight) return <main className="p-8">Insight not found</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">{insight.platform} | {insight.provider} | {insight.status}</p>
            <h1 className="text-2xl font-semibold">Marketplace Insight</h1>
            <a className="text-sm text-blue-700 underline" href={insight.sourceUrl} target="_blank" rel="noreferrer">
              {insight.sourceUrl}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            {insight.captureId ? <a className="rounded-md border bg-white px-3 py-2 text-sm" href={`/marketplace-capture/captures/${insight.captureId}/preview`}>Open capture</a> : null}
            {payload?.readiness === "ready_for_storytelling" || payload?.readiness === "ready_with_warnings" ? (
              <a className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white" href={`/media-studio?marketplaceStorytelling=1&marketplaceInsightId=${encodeURIComponent(insight.id)}`}>
                Open Storytelling
              </a>
            ) : null}
          </div>
        </header>

        <section className="rounded-md border bg-white p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs uppercase text-slate-500">Type</div>
              <div className="font-medium">{insight.insightType}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Readiness</div>
              <div className="font-medium">{payload.readiness ?? insight.storytellingReadiness ?? "-"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Confidence</div>
              <div className="font-medium">{typeof payload.confidence === "number" ? `${Math.round(payload.confidence * 100)}%` : "-"}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-slate-500">Evidence</div>
              <div className="font-medium">{evidenceIds.length}</div>
            </div>
          </div>
        </section>

        <section className="rounded-md border bg-white p-4">
          <h2 className="text-lg font-semibold">{payload.productName ?? payload.title ?? "Structured Insight"}</h2>
          {payload.shortSummary ? <p className="mt-2 text-sm text-slate-700">{payload.shortSummary}</p> : null}
          {Array.isArray(payload.blockers) && payload.blockers.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {payload.blockers.join(", ")}
            </div>
          ) : null}
          {Array.isArray(payload.customerJourneyStages) ? (
            <div className="mt-3 text-sm text-slate-600">Journey: {payload.customerJourneyStages.join(" -> ")}</div>
          ) : null}
        </section>

        {selectedImages.length > 0 ? (
          <section className="rounded-md border bg-white p-4">
            <h2 className="text-lg font-semibold">Selected Images</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {selectedImages.map((image, index) => (
                <div className="rounded-md border p-2" key={`${image.url}-${index}`}>
                  {image.url ? <img className="aspect-square w-full rounded object-cover" src={image.url} alt="" loading="lazy" /> : null}
                  <div className="mt-2 text-xs text-slate-500">{image.role} | {image.fidelity}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {storyOptions.length > 0 ? (
          <section className="rounded-md border bg-white p-4">
            <h2 className="text-lg font-semibold">Story Options + Video Storyboard</h2>
            <p className="mt-1 text-sm text-slate-500">Each option is a separate 30-second Thai video direction. No on-screen text is required.</p>
            <div className="mt-3 space-y-4">
              {storyOptions.map((option) => {
                const shots = orderedShots(option);
                return (
                <article className="rounded-md border p-3" key={option.id || option.title}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{option.title}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                      {option.autoSelected ? "Recommended" : typeof option.confidence === "number" ? `${Math.round(option.confidence * 100)}%` : "-"}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    <div><span className="font-medium">Audience:</span> {option.audience || "-"}</div>
                    <div><span className="font-medium">Need:</span> {option.customerNeed || "-"}</div>
                    <div><span className="font-medium">Problem:</span> {option.problemToSolve || "-"}</div>
                    <div><span className="font-medium">Use case:</span> {option.useCase || "-"}</div>
                    <div className="md:col-span-2"><span className="font-medium">Hook:</span> {option.hook || "-"}</div>
                  </div>
                  {asArray(option.storyboardOutline).length > 0 ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {asArray(option.storyboardOutline).map((item) => <li key={String(item)}>{String(item)}</li>)}
                    </ul>
                  ) : null}
                  {shots.length > 0 ? (
                    <div className="mt-3 rounded-md border bg-slate-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">{option.videoBrief?.structureLabel || "30 วินาที | 3 Shot | Shot ละ 10 วินาที"}</div>
                        <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">
                          {option.videoBrief?.aspectRatio || "9:16"} | {option.videoBrief?.durationSec || 30}s | no text on screen
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {shots.map((shot) => (
                          <div className="rounded-md border bg-white p-3" key={`${option.id}-${shot.order}`}>
                            <div className="font-medium">Shot {shot.order}: {shot.title} ({shot.startSec}-{shot.endSec}s)</div>
                            <div className="mt-2 text-xs font-medium uppercase text-slate-500">Video Prompt</div>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{shot.videoPrompt}</p>
                            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                              {asArray(shot.subShots).slice(0, 3).map((subShot, index) => <li key={`${String(subShot)}-${index}`}>{String(subShot)}</li>)}
                            </ol>
                            <div className="mt-2 text-xs font-medium uppercase text-slate-500">พูดเป็นภาษาไทยว่า</div>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{shot.thaiVoiceover}</p>
                          </div>
                        ))}
                      </div>
                      {shots.length < 3 ? (
                        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                          This videoBrief has only {shots.length} shot(s). Expected 3 shots.
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      Missing videoBrief for this story option.
                    </div>
                  )}
                </article>
              );
              })}
            </div>
          </section>
        ) : null}

        {claims.length > 0 ? (
          <section className="rounded-md border bg-white p-4">
            <h2 className="text-lg font-semibold">Claim Review</h2>
            <div className="mt-3 space-y-3">
              {claims.map((claim) => (
                <div className="rounded-md border p-3" key={claim.id}>
                  <div className="font-medium">{claim.text}</div>
                  <div className="text-xs text-slate-500">Status: {claim.status} | Evidence: {claim.evidenceIds?.join(", ") || "-"}</div>
                  {claim.id ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="rounded-md border bg-white px-3 py-1 text-sm" onClick={() => resolveClaim.mutate({ insightId, claimId: claim.id!, decision: "approve" })}>Approve</button>
                      <button className="rounded-md border bg-white px-3 py-1 text-sm" onClick={() => resolveClaim.mutate({ insightId, claimId: claim.id!, decision: "request_more_evidence" })}>More evidence</button>
                      <button className="rounded-md border border-red-200 bg-white px-3 py-1 text-sm text-red-700" onClick={() => resolveClaim.mutate({ insightId, claimId: claim.id!, decision: "remove" })}>Remove</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
