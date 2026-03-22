/**
 * JSON-LD Structured Data Generator — Spec 038 Section 06
 *
 * Generates schema.org Product+Review and Article JSON-LD
 * from CMS output for Google rich results.
 */

import type {
  ArticleCMSOutput,
  ProductReviewCMSOutput,
} from "@smartspec/skills";

/**
 * Generate Product + Review JSON-LD from a ProductReviewCMS output.
 */
export function generateProductReviewJsonLd(
  review: ProductReviewCMSOutput
): string {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${review.product.brand} ${review.product.model}`,
    brand: { "@type": "Brand", name: review.product.brand },
    category: review.product.category,
  };

  // Review
  const reviewObj: Record<string, unknown> = {
    "@type": "Review",
    name: review.review.title,
    reviewBody: review.review.summary,
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.review.scoring.overall,
      bestRating: review.review.scoring.max_score,
      worstRating: 0,
    },
  };

  if (review.review.pros?.length) {
    reviewObj.positiveNotes = {
      "@type": "ItemList",
      itemListElement: review.review.pros.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p,
      })),
    };
  }

  if (review.review.cons?.length) {
    reviewObj.negativeNotes = {
      "@type": "ItemList",
      itemListElement: review.review.cons.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c,
      })),
    };
  }

  jsonLd.review = reviewObj;

  // Offer (only if price present)
  if (review.product.price?.amount) {
    jsonLd.offers = {
      "@type": "Offer",
      priceCurrency: review.product.price.currency ?? "THB",
      price: review.product.price.amount,
    };
  }

  // FAQ (generates separate FAQPage if present)
  const result: unknown[] = [jsonLd];
  const faq = (review as ProductReviewCMSOutput & {
    faq?: Array<{ question: string; answer: string }>;
  }).faq;
  if (faq?.length) {
    result.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    });
  }

  return result.length === 1
    ? JSON.stringify(result[0])
    : JSON.stringify(result);
}

/**
 * Generate Article JSON-LD from an ArticleCMS output.
 */
export function generateArticleJsonLd(article: ArticleCMSOutput): string {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    inLanguage: article.locale,
  };

  if (article.seo?.meta_description) {
    jsonLd.description = article.seo.meta_description;
  }
  if (article.last_verified_at) {
    jsonLd.dateModified = article.last_verified_at;
  }

  return JSON.stringify(jsonLd);
}

/**
 * Validate a JSON-LD string. Basic structural validation.
 */
export function validateJsonLd(
  jsonLd: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  try {
    const parsed = JSON.parse(jsonLd);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item["@context"]) errors.push("Missing @context");
      if (!item["@type"]) errors.push("Missing @type");
    }
  } catch {
    errors.push("Invalid JSON");
  }
  return { valid: errors.length === 0, errors };
}
