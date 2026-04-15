# Interview Notes - 092 Thai Document OCR Routing with Typhoon OCR 1.5

## Q1. What should happen to existing deployments that only have the LandingAI key?

**Answer / assumption:** They must keep their current OCR behavior until an admin explicitly saves the new routing settings. The new Typhoon routing must be additive and backward-compatible.

## Q2. Should unsupported image formats keep using the legacy OCR path?

**Answer / assumption:** Yes. WebP, GIF, HEIC, and HEIF should continue through the legacy OCR path unless a later phase adds explicit conversion or a new provider-compatible fallback.

## Q3. Should Typhoon OCR obey the existing tenant outbound OCR policy gate?

**Answer / assumption:** Yes. If `documentOcrExternalProcessing` is disabled, the backend must not call any external OCR provider, including Typhoon OCR and legacy external OCR routes.

## Q4. Should this be tenant-scoped or deployment-wide settings?

**Answer / assumption:** Deployment-wide admin settings in `system_settings`, with tenant policy still controlling whether external OCR is allowed at all.

## Q5. What is the desired new-deployment default?

**Answer / assumption:** Typhoon OCR 1.5 should be the recommended default for both image and PDF routing only when the Typhoon key is configured and external OCR is allowed. Otherwise, the system should stay on the legacy path until an admin completes the setup.
