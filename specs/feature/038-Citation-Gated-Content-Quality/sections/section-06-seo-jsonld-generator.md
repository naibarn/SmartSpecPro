# Section 06 — SEO Structured Data Generation (JSON-LD)

## Objective

Generate valid JSON-LD structured data (Product, Review, Article schemas) from CMS output for Google rich results.

## Scope

1. Generate Product + Review JSON-LD from ProductReviewCMS output
2. Generate Article JSON-LD from ArticleCMS output
3. Validate generated JSON-LD against schema.org types
4. Integrate into output processing pipeline (Section 05)

## Primary files

- `apps/web/server/services/jsonLdGenerator.ts` — NEW: JSON-LD generation
- `apps/web/server/services/contentOutputProcessor.ts` — call generator for CMS review outputs

## JSON-LD templates

### Product Review

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "{brand} {model}",
  "brand": { "@type": "Brand", "name": "{brand}" },
  "category": "{category}",
  "review": {
    "@type": "Review",
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": "{scoring.overall}",
      "bestRating": 10,
      "worstRating": 0
    },
    "name": "{review.title}",
    "reviewBody": "{review.summary}",
    "positiveNotes": { "@type": "ItemList", "itemListElement": [/* pros */] },
    "negativeNotes": { "@type": "ItemList", "itemListElement": [/* cons */] }
  },
  "offers": {
    "@type": "Offer",
    "priceCurrency": "THB",
    "price": "{price.amount}"
  }
}
```

### Article

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{title}",
  "description": "{summary}",
  "dateModified": "{last_verified_at}",
  "inLanguage": "{locale}"
}
```

## Functions

```typescript
export function generateProductReviewJsonLd(review: ProductReviewCMSOutput): string;
export function generateArticleJsonLd(article: ArticleCMSOutput): string;
export function validateJsonLd(jsonLd: string): { valid: boolean; errors: string[] };
```

## Integration

In `contentOutputProcessor.ts`, after validation:
- If format is `cms_review` and `structured_data_jsonld` is empty/missing → generate it
- If format is `cms_article` → generate article JSON-LD and attach (optional field)

## Acceptance criteria

1. Product review JSON-LD includes Product, Review, Rating, positiveNotes, negativeNotes
2. Offers included only when price is present
3. Article JSON-LD includes headline, description, dateModified, inLanguage
4. Generated JSON-LD is valid JSON
5. Missing optional fields (price, faq) → omitted from JSON-LD (not null)
6. FAQ items generate FAQPage schema when present

## Test file

`apps/web/server/services/jsonLdGenerator.test.ts`

Test cases:
- Product review with price → includes Offer
- Product review without price → no Offer section
- Product review with FAQ → includes FAQPage
- Article → correct Article schema
- Rating value within 0-10 range
- Special characters in title/summary escaped correctly
