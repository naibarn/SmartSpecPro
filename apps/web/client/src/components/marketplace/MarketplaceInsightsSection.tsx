type MarketplaceInsightRow = {
  id: string;
  captureId?: string | null;
  productId?: string | null;
  platform?: string;
  sourceUrl?: string;
  insightType: string;
  provider?: string;
  status?: string;
  storytellingReadiness?: string | null;
  payloadJson?: Record<string, any>;
  extensionVersion?: string | null;
  insightCreatedAt?: string | Date | null;
  createdAt?: string | Date | null;
};

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function compactText(value: unknown, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : String(value);
}

function formatInsightType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatConfidence(value: unknown) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "-";
}

function uniqueStrings(items: unknown[], limit = 12) {
  return Array.from(new Set(items.map((item) => compactText(item, "")).filter(Boolean))).slice(0, limit);
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

function storyOptionKey(option: Record<string, any>) {
  return compactText(option.id, compactText(option.title, ""));
}

function storyOptionRank(option: Record<string, any>) {
  const idRank = STORY_OPTION_ORDER.indexOf(compactText(option.id, ""));
  if (idRank >= 0) return idRank;
  const titleRank = STORY_OPTION_TITLE_ORDER.indexOf(compactText(option.title, ""));
  return titleRank >= 0 ? titleRank : 99;
}

function hasCompleteVideoBrief(option: Record<string, any>) {
  const shots = asArray<Record<string, any>>(option.videoBrief?.shots);
  return shots.length >= 3 && shots.slice(0, 3).every((shot) => compactText(shot.videoPrompt, "") && compactText(shot.thaiVoiceover, ""));
}

function normalizedStoryOptions(value: unknown) {
  const seen = new Map<string, Record<string, any>>();
  for (const option of asArray<Record<string, any>>(value)) {
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

function orderedShotItems(value: unknown) {
  return asArray<Record<string, any>>(value)
    .slice()
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .slice(0, 3);
}

function insightTime(insight: MarketplaceInsightRow) {
  return new Date(String(insight.insightCreatedAt ?? insight.createdAt ?? 0)).getTime();
}

function storyOptionVideoBriefCount(insight: MarketplaceInsightRow) {
  if (insight.insightType !== "storytelling_handoff") return 0;
  return normalizedStoryOptions(insight.payloadJson?.storyOptions).filter(hasCompleteVideoBrief).length;
}

function shouldReplaceLatestInsight(candidate: MarketplaceInsightRow, current: MarketplaceInsightRow) {
  if (candidate.insightType === "storytelling_handoff" && current.insightType === "storytelling_handoff") {
    const candidateVideoCount = storyOptionVideoBriefCount(candidate);
    const currentVideoCount = storyOptionVideoBriefCount(current);
    if (candidateVideoCount !== currentVideoCount) return candidateVideoCount > currentVideoCount;
  }
  return insightTime(candidate) > insightTime(current);
}

function latestInsightsByType(insights: MarketplaceInsightRow[]) {
  const latest = new Map<string, MarketplaceInsightRow>();
  for (const insight of insights) {
    const key = insight.insightType || insight.id;
    const current = latest.get(key);
    if (!current || shouldReplaceLatestInsight(insight, current)) latest.set(key, insight);
  }
  return Array.from(latest.values()).sort((a, b) => insightTime(b) - insightTime(a));
}

function InlineList({ title, items }: { title: string; items: unknown[] }) {
  const values = uniqueStrings(items, 8);
  if (values.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase text-slate-500">{title}</div>
      <ul className="mt-1 space-y-1 text-sm text-slate-700">
        {values.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function OrderedSubShotList({ items }: { items: unknown[] }) {
  const values = items.map((item) => compactText(item, "")).filter(Boolean).slice(0, 3);
  if (values.length === 0) return null;
  return (
    <div>
      <div className="mt-2 text-xs font-medium uppercase text-slate-500">3 sub-shots</div>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        {values.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
      </ol>
    </div>
  );
}

function StoryOptionVideoBriefView({ option }: { option: Record<string, any> }) {
  const shots = orderedShotItems(option.videoBrief?.shots);
  if (shots.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Missing videoBrief for this story option.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-slate-800">
          Video brief: {compactText(option.videoBrief?.structureLabel, "30 วินาที | 3 Shot | Shot ละ 10 วินาที")}
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-500">
          {compactText(option.videoBrief?.aspectRatio, "9:16")} | {compactText(option.videoBrief?.durationSec, "30")}s | no text on screen
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {shots.map((shot) => (
          <div className="rounded-md border bg-white p-3" key={`${compactText(option.id, compactText(option.title))}-${compactText(shot.order)}`}>
            <div className="text-sm font-medium">
              Shot {compactText(shot.order)}: {compactText(shot.title)} ({compactText(shot.startSec)}-{compactText(shot.endSec)}s)
            </div>
            <div className="mt-2 text-xs font-medium uppercase text-slate-500">Video Prompt</div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{compactText(shot.videoPrompt)}</p>
            <OrderedSubShotList items={asArray(shot.subShots)} />
            <div className="mt-2 text-xs font-medium uppercase text-slate-500">พูดเป็นภาษาไทยว่า</div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{compactText(shot.thaiVoiceover)}</p>
          </div>
        ))}
      </div>
      {shots.length < 3 ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          This videoBrief has only {shots.length} shot(s). Expected 3 shots.
        </div>
      ) : null}
    </div>
  );
}

function ProductBriefView({ payload }: { payload: Record<string, any> }) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-slate-700">{compactText(payload.shortSummary)}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <InlineList title="Selling points" items={asArray(payload.keySellingPoints)} />
        <InlineList title="Hooks" items={asArray(payload.suggestedHooks)} />
        <InlineList title="Audience" items={asArray(payload.targetAudiences)} />
        <InlineList title="Objections / trust" items={[...asArray(payload.buyerObjections), ...asArray(payload.trustSignals)]} />
        <InlineList title="Content angles" items={asArray(payload.contentAngles)} />
        <InlineList title="CTA" items={asArray(payload.suggestedCTAs)} />
      </div>
    </div>
  );
}

function ReviewInsightView({ payload }: { payload: Record<string, any> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <InlineList title="Positive themes" items={asArray(payload.positiveThemes)} />
      <InlineList title="Negative themes" items={asArray(payload.negativeThemes)} />
      <InlineList title="Buyer questions" items={asArray(payload.commonBuyerQuestions)} />
      <InlineList title="Objections to address" items={asArray(payload.objectionsToAddress)} />
      <InlineList title="Content recommendations" items={asArray(payload.contentRecommendations)} />
      <div>
        <div className="text-xs font-medium uppercase text-slate-500">FAQ drafts</div>
        <div className="mt-1 space-y-2 text-sm text-slate-700">
          {asArray<Record<string, any>>(payload.recommendedFAQ).slice(0, 6).map((faq, index) => (
            <div key={`${faq.question}-${index}`}>
              <div className="font-medium">{compactText(faq.question)}</div>
              <div>{compactText(faq.answerDraft)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VideoBriefView({ payload }: { payload: Record<string, any> }) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-700">
        <span className="font-medium">Hook:</span> {compactText(payload.hook)}
      </div>
      <div className="text-sm text-slate-700">
        <span className="font-medium">Format:</span> {compactText(payload.targetFormat)} | {compactText(payload.aspectRatio)} | {compactText(payload.durationSec)}s
      </div>
      <div className="space-y-2">
        {asArray<Record<string, any>>(payload.scenes).slice(0, 8).map((scene) => (
          <div className="rounded-md border bg-slate-50 p-3" key={`${scene.order}-${scene.startSec}`}>
            <div className="text-sm font-medium">{compactText(scene.startSec)}-{compactText(scene.endSec)}s: {compactText(scene.sceneGoal)}</div>
            <div className="mt-1 text-sm text-slate-600">{compactText(scene.visualSuggestion)}</div>
            <div className="mt-1 text-xs text-slate-500">Text: {compactText(scene.onScreenText)}</div>
          </div>
        ))}
      </div>
      <InlineList title="Assets needed" items={asArray(payload.assetsNeeded)} />
    </div>
  );
}

function StorytellingHandoffView({ payload }: { payload: Record<string, any> }) {
  const selectedImages = Array.from(new Map(asArray<Record<string, any>>(payload.selectedImages)
    .filter((image) => image.url)
    .map((image) => [String(image.url), image])).values());
  const storyOptions = normalizedStoryOptions(payload.storyOptions);
  const storyOptionVideoBriefCount = storyOptions.filter((option) => asArray(option.videoBrief?.shots).length === 3).length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <div className="text-xs font-medium uppercase text-slate-500">Readiness</div>
          <div className="font-medium">{compactText(payload.readiness)}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-slate-500">Story format</div>
          <div className="font-medium">{compactText(payload.storyFormat)}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-slate-500">Journey</div>
          <div className="font-medium">{asArray(payload.customerJourneyStages).join(" -> ") || "-"}</div>
        </div>
      </div>
      <InlineList title="Blockers" items={asArray(payload.blockers)} />
      {storyOptions.length > 0 ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-medium uppercase text-slate-500">Storytelling Handoff: 4 formats with videoBrief</div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
              {storyOptions.length} formats | {storyOptionVideoBriefCount} video briefs
            </span>
          </div>
          <div className="mt-2 grid gap-3 lg:grid-cols-2">
            {storyOptions.map((option) => (
              <div className="rounded-md border bg-white p-3 text-sm" key={compactText(option.id, compactText(option.title))}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{compactText(option.title)}</div>
                  <span className={option.autoSelected ? "rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600"}>
                    {option.autoSelected ? "Recommended" : formatConfidence(option.confidence)}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {compactText(option.storyFormat)} | {asArray(option.journeyStages).join(" -> ") || "-"} | Evidence {asArray(option.evidenceIds).length}
                </div>
                <div className="mt-2 space-y-1 text-slate-700">
                  <div><span className="font-medium">Audience:</span> {compactText(option.audience)}</div>
                  <div><span className="font-medium">Need:</span> {compactText(option.customerNeed)}</div>
                  <div><span className="font-medium">Problem:</span> {compactText(option.problemToSolve)}</div>
                  <div><span className="font-medium">Use case:</span> {compactText(option.useCase)}</div>
                  <div><span className="font-medium">Hook:</span> {compactText(option.hook)}</div>
                </div>
                <InlineList title="Storyboard outline" items={asArray(option.storyboardOutline)} />
                <StoryOptionVideoBriefView option={option} />
                {asArray<Record<string, any>>(option.userAdditions).length > 0 ? (
                  <div className="mt-3 rounded-md border bg-emerald-50 p-2">
                    <div className="text-xs font-medium uppercase text-emerald-700">User-confirmed additions</div>
                    <div className="mt-1 space-y-1">
                      {asArray<Record<string, any>>(option.userAdditions).slice(-6).map((addition, index) => (
                        <div className="text-xs text-emerald-900" key={`${compactText(addition.category)}-${index}`}>
                          <span className="font-medium">{compactText(addition.category)}:</span> {asArray(addition.values).join(" / ")}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {option.decisionReason ? <div className="mt-2 text-xs text-slate-500">{compactText(option.decisionReason)}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {selectedImages.length > 0 ? (
        <div>
          <div className="text-xs font-medium uppercase text-slate-500">Selected images</div>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            {selectedImages.slice(0, 8).map((image, index) => (
              <figure className="rounded-md border bg-slate-50 p-2" key={`${image.url}-${index}`}>
                {image.url ? <img className="aspect-square w-full rounded object-cover" src={image.url} alt="" loading="lazy" /> : null}
                <figcaption className="mt-1 text-xs text-slate-500">{compactText(image.role)} | {compactText(image.fidelity)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <div className="text-xs font-medium uppercase text-slate-500">Claims</div>
        <div className="mt-2 space-y-2">
          {asArray<Record<string, any>>(payload.claims).slice(0, 8).map((claim) => (
            <div className="rounded-md border bg-white p-3 text-sm" key={compactText(claim.id, compactText(claim.text))}>
              <div className="font-medium">{compactText(claim.text)}</div>
              <div className="mt-1 text-xs text-slate-500">Status: {compactText(claim.status)} | Evidence: {asArray(claim.evidenceIds).length} | Confidence: {formatConfidence(claim.confidence)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OpportunityView({ payload }: { payload: Record<string, any> }) {
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p>{compactText(payload.opportunitySummary)}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <div><span className="font-medium">Trend fit:</span> {compactText(payload.productTrendFitScore)}</div>
        <div><span className="font-medium">Format:</span> {compactText(payload.recommendedContentFormat)}</div>
        <div><span className="font-medium">Positioning:</span> {compactText(payload.suggestedPositioning)}</div>
      </div>
      <InlineList title="Risks" items={asArray(payload.risks)} />
      <InlineList title="Next actions" items={asArray(payload.nextActions)} />
    </div>
  );
}

function TrendBriefView({ payload }: { payload: Record<string, any> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <div className="text-xs font-medium uppercase text-slate-500">Hook pattern</div>
        <p className="mt-1 text-sm text-slate-700">{compactText(payload.hookPattern)}</p>
      </div>
      <div>
        <div className="text-xs font-medium uppercase text-slate-500">Content type</div>
        <p className="mt-1 text-sm text-slate-700">{compactText(payload.contentType)}</p>
      </div>
      <InlineList title="Structure" items={asArray(payload.structure)} />
      <InlineList title="Audience" items={asArray(payload.audience)} />
      <InlineList title="Engagement drivers" items={asArray(payload.engagementDrivers)} />
      <InlineList title="Replicable ideas" items={asArray(payload.replicableIdeas)} />
      <InlineList title="Risks" items={asArray(payload.risks)} />
      <InlineList title="Hashtags" items={asArray(payload.hashtags)} />
    </div>
  );
}

function InsightPayloadView({ insight }: { insight: MarketplaceInsightRow }) {
  const payload = insight.payloadJson ?? {};
  if (insight.insightType === "product_brief") return <ProductBriefView payload={payload} />;
  if (insight.insightType === "review_insight") return <ReviewInsightView payload={payload} />;
  if (insight.insightType === "tiktok_shop_trend") return <TrendBriefView payload={payload} />;
  if (insight.insightType === "combined_opportunity") return <OpportunityView payload={payload} />;
  if (insight.insightType === "video_brief") return <VideoBriefView payload={payload} />;
  if (insight.insightType === "storytelling_handoff") return <StorytellingHandoffView payload={payload} />;
  return <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(payload, null, 2)}</pre>;
}

export function MarketplaceInsightsSection({
  insights,
  isLoading,
  title = "AI Insights",
  emptyText = "No AI insights have been synced for this item yet.",
  allowStorytellingAction = false,
}: {
  insights: MarketplaceInsightRow[];
  isLoading?: boolean;
  title?: string;
  emptyText?: string;
  allowStorytellingAction?: boolean;
}) {
  const rows = Array.from(new Map(insights
    .filter((insight) => insight && insight.insightType !== "video_brief")
    .map((insight) => [insight.id, insight])).values());
  const sortedRows = latestInsightsByType(rows);
  const readiness = sortedRows.find((insight) => insight.storytellingReadiness)?.storytellingReadiness;
  const hiddenHistoryCount = Math.max(0, rows.length - sortedRows.length);

  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Generated from capture</p>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">Structured outputs synced from the Chrome Extension for product brief, review signals, story options, and storytelling readiness.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{sortedRows.length} latest records</span>
          {hiddenHistoryCount > 0 ? <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">{hiddenHistoryCount} history hidden</span> : null}
          {readiness ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">{readiness}</span> : null}
        </div>
      </div>

      {isLoading ? <p className="mt-4 text-sm text-slate-500">Loading AI insights...</p> : null}
      {!isLoading && sortedRows.length === 0 ? <p className="mt-4 rounded-md border bg-slate-50 p-3 text-sm text-slate-500">{emptyText}</p> : null}

      <div className="mt-4 space-y-4">
        {sortedRows.map((insight) => {
          const payload = insight.payloadJson ?? {};
          const syncMetadata = payload.__syncMetadata as Record<string, any> | undefined;
          const evidenceIds = asArray(payload.evidenceIds ?? syncMetadata?.inputEvidenceIds);
          return (
            <article className="rounded-md border bg-white p-4" key={insight.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{formatInsightType(insight.insightType)}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{compactText(insight.provider)}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{compactText(insight.status)}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Created {formatDate(insight.insightCreatedAt ?? insight.createdAt)}
                    {" | "}Confidence {formatConfidence(payload.confidence)}
                    {" | "}Evidence {evidenceIds.length}
                    {insight.extensionVersion ? ` | Extension ${insight.extensionVersion}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50" href={`/marketplace-capture/insights/${encodeURIComponent(insight.id)}`}>
                    Open insight
                  </a>
                  {allowStorytellingAction && insight.insightType === "storytelling_handoff" && (payload.readiness === "ready_for_storytelling" || payload.readiness === "ready_with_warnings") ? (
                    <a className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white" href={`/media-studio?marketplaceStorytelling=1&marketplaceInsightId=${encodeURIComponent(insight.id)}`}>
                      Use in Media Studio
                    </a>
                  ) : null}
                </div>
              </div>
              <div className="mt-4">
                <InsightPayloadView insight={insight} />
              </div>
              {syncMetadata?.dataQualityWarnings?.length || syncMetadata?.selectedImageQuality?.length ? (
                <details className="mt-4 rounded-md border bg-slate-50 p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-700">Capture sync metadata</summary>
                  <div className="mt-3 grid gap-4 md:grid-cols-2">
                    <InlineList title="Data quality warnings" items={asArray(syncMetadata.dataQualityWarnings)} />
                    <InlineList title="Selected image quality" items={asArray<Record<string, any>>(syncMetadata.selectedImageQuality).map((image) => `${compactText(image.role)} ${compactText(image.width)}x${compactText(image.height)} ${compactText(image.qualityLabel, "")}`)} />
                  </div>
                </details>
              ) : null}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-500">Raw structured payload</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(payload, null, 2)}</pre>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
