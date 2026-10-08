import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "wouter";
import { useTenant } from "@/contexts/TenantContext";

type SeoInput = {
  title: string;
  description: string;
  keywords?: string[];
  image?: string | null;
  canonicalPath?: string;
  canonicalUrl?: string;
  type?: "website" | "article" | "profile";
  noIndex?: boolean;
  fetchTenantSeo?: boolean;
  useTenantDefaults?: boolean;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
};

type TenantSeoDefaults = {
  defaultTitle?: string;
  defaultDescription?: string;
  defaultKeywords?: string[];
  ogImage?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  aiContext?: string;
  aiKeyFacts?: string[];
  structuredData?: Record<string, unknown>;
};

type RemoteSeoResponse = {
  seo?: TenantSeoDefaults;
  metadata?: {
    title?: string;
    description?: string | null;
    keywords?: string[] | null;
    canonicalUrl?: string | null;
    ogMetadata?: { image?: string };
    twitterMetadata?: { card?: "summary" | "summary_large_image" | "app" | "player" };
    structuredData?: Record<string, unknown> | null;
    aiContent?: {
      faqs?: Array<{ question: string; answer: string }>;
      howTo?: Array<{ step: number; instruction: string; tip?: string }>;
    };
  } | null;
  relatedLinks?: Array<{ href: string; label: string; description: string }>;
};

/** Remove head metadata injected for no-JS crawlers once the route owns Helmet. */
export function removePrerenderedSeoHeadMetadata(): void {
  document.head
    .querySelectorAll(
      'link[rel="canonical"][data-seo-prerender="true"], meta[property="og:url"][data-seo-prerender="true"], meta[name="description"][data-seo-prerender="true"]',
    )
    .forEach((element) => element.remove());

  document
    .querySelector('main#smartaihub-prerender[data-seo-prerender="true"]')
    ?.remove();
}

function keepOneHeadValue(selector: string, attribute: string, value: string): void {
  const elements = Array.from(document.head.querySelectorAll<HTMLElement>(selector));
  const keeper = elements.find((element) => element.getAttribute(attribute) === value)
    || elements[elements.length - 1];

  if (keeper) {
    keeper.setAttribute(attribute, value);
  }

  elements.forEach((element) => {
    if (element !== keeper) element.remove();
  });
}

/** Make the active route's Helmet values authoritative over stale static head tags. */
export function reconcileActiveSeoHeadMetadata({
  title,
  description,
  canonicalUrl,
  noIndex,
  keywords,
}: {
  title: string;
  description: string;
  canonicalUrl: string;
  noIndex: boolean;
  keywords: string[];
}): void {
  if (typeof document === "undefined") return;

  const titleElements = Array.from(document.head.querySelectorAll("title"));
  const matchingTitle = titleElements.find((element) => element.textContent === title);
  const titleElement = matchingTitle || titleElements[titleElements.length - 1] || document.createElement("title");
  titleElement.textContent = title;
  if (!titleElement.parentElement) document.head.append(titleElement);
  titleElements.forEach((element) => {
    if (element !== titleElement) element.remove();
  });

  keepOneHeadValue('meta[name="description"]', "content", description);
  keepOneHeadValue('link[rel="canonical"]', "href", canonicalUrl);
  keepOneHeadValue('meta[property="og:url"]', "content", canonicalUrl);
  keepOneHeadValue('meta[property="og:title"]', "content", title);
  keepOneHeadValue('meta[property="og:description"]', "content", description);
  keepOneHeadValue('meta[name="twitter:title"]', "content", title);
  keepOneHeadValue('meta[name="twitter:description"]', "content", description);
  keepOneHeadValue('meta[name="robots"]', "content", noIndex ? "noindex,nofollow" : "index,follow");

  if (keywords.length > 0) {
    keepOneHeadValue('meta[name="keywords"]', "content", keywords.join(", "));
  } else {
    document.head.querySelectorAll('meta[name="keywords"]').forEach((element) => element.remove());
  }
}

function uniq(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => !!value && value.trim().length > 0)));
}

function buildAbsoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  if (typeof window === "undefined") {
    return pathOrUrl;
  }

  return new URL(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`, window.location.origin).toString();
}

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeFaqJsonLd(faqs?: Array<{ question: string; answer: string }>) {
  if (!faqs?.length) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

function makeHowToJsonLd(steps?: Array<{ step: number; instruction: string; tip?: string }>, name?: string) {
  if (!steps?.length) return null;

  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: name || "How to get started",
    step: steps.map((step) => ({
      "@type": "HowToStep",
      position: step.step,
      name: step.instruction,
      text: step.tip ? `${step.instruction} ${step.tip}` : step.instruction,
    })),
  };
}

export function Seo({
  title,
  description,
  keywords = [],
  image,
  canonicalPath,
  canonicalUrl,
  type = "website",
  noIndex = false,
  fetchTenantSeo = true,
  useTenantDefaults = true,
  jsonLd,
}: SeoInput) {
  const [location] = useLocation();
  const { tenant } = useTenant();
  const [remoteSeo, setRemoteSeo] = useState<RemoteSeoResponse | null>(null);

  const resolvedPath = canonicalPath || location || "/";

  useEffect(() => {
    if (!fetchTenantSeo || !useTenantDefaults) return;

    const controller = new AbortController();

    fetch(`/api/tenant/seo?path=${encodeURIComponent(resolvedPath)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setRemoteSeo(data))
      .catch(() => undefined);

    return () => controller.abort();
  }, [fetchTenantSeo, resolvedPath, useTenantDefaults]);

  const merged = useMemo(() => {
    const tenantSeo: TenantSeoDefaults = (useTenantDefaults ? tenant?.seo : undefined) ?? {};
    const apiSeo: TenantSeoDefaults = (useTenantDefaults ? remoteSeo?.seo : undefined) ?? {};
    const metadata = useTenantDefaults ? remoteSeo?.metadata || {} : {};

    // The active page is the most specific source. Tenant/API metadata is a
    // fallback so stale CMS SEO cannot override the page currently rendered.
    const finalTitle = title || metadata.title || apiSeo.defaultTitle || tenantSeo.defaultTitle;
    const finalDescription =
      description ||
      metadata.description ||
      apiSeo.defaultDescription ||
      tenantSeo.defaultDescription;
    const preferredKeywords = keywords.length
      ? keywords
      : metadata.keywords?.length
        ? metadata.keywords
        : apiSeo.defaultKeywords || tenantSeo.defaultKeywords || [];
    const finalKeywords = uniq([
      ...preferredKeywords,
    ]);
    // Do not invent a social-preview asset. Public media must be explicitly
    // selected by the route or tenant SEO record so provenance stays auditable.
    const finalImage = image === null
      ? null
      : image || metadata.ogMetadata?.image || apiSeo.ogImage || tenantSeo.ogImage || null;
    const finalCanonical = canonicalUrl || buildAbsoluteUrl(resolvedPath) || metadata.canonicalUrl;
    const explicitJsonLd = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
    const inferredJsonLd = explicitJsonLd.length > 0
      ? []
      : [
          metadata.structuredData,
          apiSeo.structuredData,
          makeFaqJsonLd(metadata.aiContent?.faqs),
          makeHowToJsonLd(metadata.aiContent?.howTo, finalTitle),
        ].filter(Boolean);

    return {
      title: finalTitle,
      description: finalDescription || stripHtml(description).slice(0, 160),
      keywords: finalKeywords,
      image: finalImage,
      canonicalUrl: finalCanonical,
      siteName: useTenantDefaults ? tenant?.name || "SmartAIHub" : "SmartAIHub",
      twitterCard: metadata.twitterMetadata?.card || apiSeo.twitterCard || tenantSeo.twitterCard || "summary_large_image",
      jsonLdItems: [
        ...explicitJsonLd,
        ...inferredJsonLd,
      ].filter(Boolean),
    };
  }, [canonicalUrl, description, image, keywords, jsonLd, remoteSeo, resolvedPath, tenant?.name, tenant?.seo, title, useTenantDefaults]);

  useEffect(() => {
    removePrerenderedSeoHeadMetadata();
    reconcileActiveSeoHeadMetadata({
      title: merged.title,
      description: merged.description,
      canonicalUrl: merged.canonicalUrl,
      noIndex,
      keywords: merged.keywords,
    });
  }, [merged, noIndex]);

  return (
    <Helmet>
      <title>{merged.title}</title>
      <meta name="description" content={merged.description} />
      {merged.keywords.length > 0 && <meta name="keywords" content={merged.keywords.join(", ")} />}
      <meta name="robots" content={noIndex ? "noindex,nofollow" : "index,follow"} />
      <link rel="canonical" href={merged.canonicalUrl} />

      <meta property="og:type" content={type} />
      <meta property="og:title" content={merged.title} />
      <meta property="og:description" content={merged.description} />
      {merged.image && <meta property="og:image" content={merged.image} />}
      <meta property="og:url" content={merged.canonicalUrl} />
      <meta property="og:site_name" content={merged.siteName} />

      <meta name="twitter:card" content={merged.twitterCard} />
      <meta name="twitter:title" content={merged.title} />
      <meta name="twitter:description" content={merged.description} />
      {merged.image && <meta name="twitter:image" content={merged.image} />}

      {merged.jsonLdItems.map((item, index) => (
        <script
          key={index}
          type="application/ld+json"
        >
          {JSON.stringify(item)}
        </script>
      ))}
    </Helmet>
  );
}
