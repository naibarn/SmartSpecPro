/**
 * SEO Head Component
 * AI-Optimized SEO with support for traditional SEO, AIO, and GEO targeting
 */

import { Helmet } from "react-helmet-async";
import { useTenant } from "@/contexts/TenantContext";

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string[];
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: string;

  // AI-Optimized Content
  aiContext?: string;
  aiKeyFacts?: string[];
  structuredData?: Record<string, any>;

  // GEO targeting
  geoData?: {
    country?: string;
    region?: string;
    language?: string;
  };
}

export function SEOHead({
  title,
  description,
  keywords = [],
  canonicalUrl,
  ogImage,
  ogType = "website",
  aiContext,
  aiKeyFacts = [],
  structuredData,
  geoData,
}: SEOHeadProps) {
  const { tenant, theme } = useTenant();

  if (!tenant) return null;

  const seo = tenant.seo;
  const fullTitle = title ? `${title} | ${tenant.name}` : seo.defaultTitle;
  const fullDescription = description || seo.defaultDescription;
  const allKeywords = [...keywords, ...seo.defaultKeywords];
  const image = ogImage || seo.ogImage;
  const url = canonicalUrl || `https://${tenant.primaryDomain}`;

  // Combine AI context
  const combinedAiContext = [
    aiContext,
    seo.aiContext,
    `This content is from ${tenant.name}.`,
    ...aiKeyFacts,
    ...(seo.aiKeyFacts || []),
  ]
    .filter(Boolean)
    .join(" ");

  // Build structured data with defaults
  const fullStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: tenant.name,
    url: `https://${tenant.primaryDomain}`,
    description: fullDescription,
    ...structuredData,
  };

  // GEO meta tags
  const geoTargeting = geoData || seo.geoTargeting;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={fullDescription} />
      {allKeywords.length > 0 && (
        <meta name="keywords" content={allKeywords.join(", ")} />
      )}
      {canonicalUrl && <link rel="canonical" href={url} />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={fullDescription} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={tenant.name} />
      {image && <meta property="og:image" content={image} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content={seo.twitterCard} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={fullDescription} />
      {image && <meta name="twitter:image" content={image} />}

      {/* AI-Optimized Meta Tags for LLMs */}
      {combinedAiContext && (
        <>
          {/* Natural language context for AI crawlers */}
          <meta name="ai:context" content={combinedAiContext} />
          <meta name="ai:summary" content={fullDescription} />

          {/* Alternative meta tags that AI crawlers might read */}
          <meta name="description:ai" content={combinedAiContext} />
          <meta property="article:summary" content={combinedAiContext} />
        </>
      )}

      {/* GEO Targeting Meta Tags */}
      {geoTargeting?.country && (
        <meta name="geo.region" content={geoTargeting.country} />
      )}
      {geoTargeting?.region && (
        <meta name="geo.placename" content={geoTargeting.region} />
      )}
      {geoTargeting?.language && (
        <meta httpEquiv="content-language" content={geoTargeting.language} />
      )}

      {/* Structured Data (JSON-LD) */}
      <script type="application/ld+json">
        {JSON.stringify(fullStructuredData)}
      </script>

      {/* Theme Color */}
      <meta name="theme-color" content={theme.primaryColor} />

      {/* Favicon */}
      {tenant.faviconUrl && <link rel="icon" href={tenant.faviconUrl} />}

      {/* Robots meta tag */}
      <meta name="robots" content="index, follow, max-image-preview:large" />

      {/* Additional meta tags for AI discoverability */}
      <meta name="author" content={tenant.name} />
      <meta property="article:publisher" content={`https://${tenant.primaryDomain}`} />
    </Helmet>
  );
}
