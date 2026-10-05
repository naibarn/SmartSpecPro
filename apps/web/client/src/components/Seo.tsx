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

    const finalTitle = metadata.title || apiSeo.defaultTitle || tenantSeo.defaultTitle || title;
    const finalDescription =
      metadata.description ||
      apiSeo.defaultDescription ||
      tenantSeo.defaultDescription ||
      description;
    const finalKeywords = uniq([
      ...(metadata.keywords || apiSeo.defaultKeywords || tenantSeo.defaultKeywords || []),
      ...keywords,
    ]);
    // Do not invent a social-preview asset. Public media must be explicitly
    // selected by the route or tenant SEO record so provenance stays auditable.
    const finalImage = image === null
      ? null
      : metadata.ogMetadata?.image || apiSeo.ogImage || tenantSeo.ogImage || image || null;
    const finalCanonical = canonicalUrl || metadata.canonicalUrl || buildAbsoluteUrl(resolvedPath);
    const inferredJsonLd = [
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
        ...(Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : []),
        ...inferredJsonLd,
      ].filter(Boolean),
    };
  }, [canonicalUrl, description, image, keywords, jsonLd, remoteSeo, resolvedPath, tenant?.name, tenant?.seo, title, useTenantDefaults]);

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
