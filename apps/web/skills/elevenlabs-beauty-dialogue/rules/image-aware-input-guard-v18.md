# Image-aware Input Guard v18

This skill supports optional product image uploads. Images are used as supporting evidence to improve the final spoken dialogue, not as the sole source of truth.

## Upload behavior

- `product_images` is optional.
- Users may drag-and-drop or click upload.
- Maximum: 5 images.
- Do not ask users to paste image URLs.
- Prefer photos of: front packaging, back label, ingredients, usage instructions, warnings, texture, swatch, variant, or pack size.

## Analysis workflow

When images are present and `image_analysis_mode` is not `off`:

1. Read `product_details` first.
2. Inspect uploaded images only for visible or clearly readable details.
3. Use images to confirm product category, format, package size, variant, shade, scent, texture, visible warnings, expiry/lot details, and label conflicts.
4. If image text and product text conflict, do not combine them into one exaggerated product. Use safe, neutral wording or focus on the stable overlapping facts.
5. If the image contains before/after, body/skin result visuals, doctors, pharmacists, lab coats, graphs, certificates, medals, or clinical-looking badges, treat them as risk signals. Do not convert them into spoken proof unless the user provides legitimate supporting evidence in text.

## Hard limits

The final spoken output must not invent claims from images. Do not infer:

- medical effectiveness, diagnosis, cure, treatment, or prevention;
- whitening/brightening results beyond safe cosmetic wording;
- doctor/pharmacist/dermatologist endorsement;
- FDA/registration approval as performance proof;
- exact ingredient concentration unless clearly readable;
- guaranteed results from before/after images;
- competitor comparisons or famous-brand dupe claims.

## Safe use examples

Allowed:

- “ขวดปั๊ม 100 มล.” if clearly visible.
- “สูตร 5 Free ตามฉลาก” if clearly visible.
- “มีหลายเฉดให้เลือก” if variants are visible and consistent with text.
- “เนื้อเจล / สเปรย์ / ซองรีฟิล” if image clearly shows format.

Not allowed:

- “แพทย์รับรอง” because a person in a white coat appears in an image.
- “เห็นผลใน 7 วัน” because a before/after graphic appears.
- “ขาวขึ้นจริง” because model skin looks bright in the photo.

## Final output rule

The final output remains customer-facing plain text dialogue only. Do not mention image analysis, risk checks, policy, or compliance notes in the spoken dialogue.
