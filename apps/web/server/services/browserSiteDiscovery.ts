import { z } from "zod";

import {
  buildBrowserInstruction,
  getBrowserSkillPreset,
  inferBrowserSkillId,
  type BrowserSkillId,
} from "../../shared/browserSkills";
import { getProviderForModel } from "./llmRouter";
import {
  buildWebSearchParams,
  detectProviderFamily,
} from "./webSearchToolInjector";

const browserDiscoveryCandidateSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  reason: z.string().min(1),
});

const browserDiscoveryResponseSchema = z.object({
  summary: z.string().min(1),
  candidates: z.array(browserDiscoveryCandidateSchema).min(1).max(5),
  recommendedUrl: z.string().url().optional(),
});

export interface BrowserSiteDiscoveryCandidate {
  label: string;
  url: string;
  reason: string;
}

export interface BrowserSiteDiscoveryResult {
  strategy: "llm_web_search" | "heuristic_fallback";
  summary: string;
  recommendedUrl: string | null;
  candidates: BrowserSiteDiscoveryCandidate[];
  discoveredDomains: string[];
}

function buildDiscoveryPrompt(input: {
  goal: string;
  skillId: BrowserSkillId;
}): string {
  const skill = getBrowserSkillPreset(input.skillId);
  return [
    "Return JSON only.",
    "Find the best websites to begin this browser task.",
    "Prefer sites that are directly useful for the task instead of generic homepages.",
    "Include 2 to 5 candidate sites with short reasons.",
    "If the user does not know which site to use, infer the most relevant sites from the goal.",
    `Skill preset: ${skill.label}. ${skill.description}`,
    `Normalized instruction: ${buildBrowserInstruction({ goal: input.goal, skillId: input.skillId })}`,
  ].join("\n");
}

function dedupeCandidates(
  candidates: BrowserSiteDiscoveryCandidate[],
): BrowserSiteDiscoveryCandidate[] {
  const seen = new Set<string>();
  const deduped: BrowserSiteDiscoveryCandidate[] = [];
  for (const candidate of candidates) {
    let normalizedUrl: string;
    try {
      normalizedUrl = new URL(candidate.url).toString();
    } catch {
      continue;
    }
    if (seen.has(normalizedUrl)) {
      continue;
    }
    seen.add(normalizedUrl);
    deduped.push({
      label: candidate.label.trim(),
      url: normalizedUrl,
      reason: candidate.reason.trim(),
    });
  }
  return deduped;
}

function extractDomains(candidates: BrowserSiteDiscoveryCandidate[]): string[] {
  return Array.from(new Set(
    candidates.flatMap((candidate) => {
      try {
        return [new URL(candidate.url).hostname];
      } catch {
        return [];
      }
    }),
  ));
}

function inferHeuristicCandidates(goal: string, skillId: BrowserSkillId): BrowserSiteDiscoveryCandidate[] {
  const normalized = goal.toLowerCase();
  if (skillId === "compare_options" || normalized.includes("hotel") || normalized.includes("flight")) {
    return [
      {
        label: "Google Travel",
        url: "https://www.google.com/travel",
        reason: "Broad search surface for flights, hotels, and date comparisons.",
      },
      {
        label: "Booking.com",
        url: "https://www.booking.com/",
        reason: "High-coverage travel listings for price and availability comparison.",
      },
      {
        label: "Skyscanner",
        url: "https://www.skyscanner.com/",
        reason: "Useful when the task needs route and fare comparison across providers.",
      },
    ];
  }
  if (skillId === "checkout_assistant") {
    return [
      {
        label: "Google Search",
        url: "https://www.google.com/",
        reason: "Use search to find the correct merchant or booking flow when no site is specified.",
      },
      {
        label: "Official Merchant Site",
        url: "https://www.google.com/search?q=official+site",
        reason: "Fallback route to identify the primary checkout or booking destination.",
      },
    ];
  }
  if (skillId === "account_access") {
    return [
      {
        label: "Google Search",
        url: "https://www.google.com/",
        reason: "Use search to find the correct official login or account portal.",
      },
      {
        label: "Official Account Portal",
        url: "https://www.google.com/search?q=official+login+portal",
        reason: "Fallback route to locate the right authentication entry point.",
      },
    ];
  }
  return [
    {
      label: "Google Search",
      url: "https://www.google.com/",
      reason: "Broad fallback search entry point when the correct site is not yet known.",
    },
    {
      label: "Official Website Search",
      url: "https://www.google.com/search?q=official+website",
      reason: "Fallback search route to identify the primary site that matches the goal.",
    },
  ];
}

async function discoverWithLlm(input: {
  goal: string;
  model: string;
  skillId: BrowserSkillId;
}): Promise<BrowserSiteDiscoveryResult | null> {
  const provider = await getProviderForModel(input.model);
  if (!provider) {
    return null;
  }

  const providerFamily = detectProviderFamily(provider.providerName);
  const webSearch = buildWebSearchParams(providerFamily);
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const url = baseUrl.includes("/v1")
    ? `${baseUrl}/chat/completions`
    : `${baseUrl}/v1/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: "system",
          content: buildDiscoveryPrompt({
            goal: input.goal,
            skillId: input.skillId,
          }),
        },
        {
          role: "user",
          content: input.goal,
        },
      ],
      max_tokens: 900,
      temperature: 0.1,
      response_format: { type: "json_object" },
      ...(webSearch.bodyParams ?? {}),
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text().catch(() => response.statusText));
  }

  const data = await response.json();
  const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
  if (!content) {
    return null;
  }

  const parsed = browserDiscoveryResponseSchema.safeParse(JSON.parse(content));
  if (!parsed.success) {
    return null;
  }

  const candidates = dedupeCandidates(parsed.data.candidates);
  if (candidates.length === 0) {
    return null;
  }

  const recommendedUrl = parsed.data.recommendedUrl && candidates.some((candidate) => candidate.url === parsed.data.recommendedUrl)
    ? parsed.data.recommendedUrl
    : candidates[0]?.url ?? null;

  return {
    strategy: "llm_web_search",
    summary: parsed.data.summary,
    recommendedUrl,
    candidates,
    discoveredDomains: extractDomains(candidates),
  };
}

export async function discoverBrowserTargets(input: {
  goal: string;
  model: string;
  skillId?: BrowserSkillId | null;
}): Promise<BrowserSiteDiscoveryResult> {
  const goal = input.goal.trim();
  const skillId = input.skillId ?? inferBrowserSkillId(goal);
  if (!goal) {
    return {
      strategy: "heuristic_fallback",
      summary: "No discovery goal was provided.",
      recommendedUrl: null,
      candidates: [],
      discoveredDomains: [],
    };
  }

  try {
    const discovered = await discoverWithLlm({
      goal,
      model: input.model,
      skillId,
    });
    if (discovered) {
      return discovered;
    }
  } catch {
    // Fall back to deterministic defaults so the session can still start.
  }

  const candidates = dedupeCandidates(inferHeuristicCandidates(goal, skillId));
  return {
    strategy: "heuristic_fallback",
    summary: "Fell back to default website candidates because live site discovery was unavailable.",
    recommendedUrl: candidates[0]?.url ?? null,
    candidates,
    discoveredDomains: extractDomains(candidates),
  };
}
