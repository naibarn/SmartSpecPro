# SmartAIHub Marketplace Capture Extension

Development build for user-assisted Shopee/TikTok Shop product capture.

## Build

```bash
npm --prefix apps/extension run build
```

Load `apps/extension/dist` in Chrome:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select `apps/extension/dist`

## Connect

1. Login to SmartAIHub.
2. Open `/marketplace-capture/connect`.
3. Or click `Connect SmartAIHub` in the side panel to open the connect page with the extension origin prefilled.
4. Generate an extension token.
5. Open the extension side panel and paste:
   - Base URL: `https://smartaihub.app` (default)
   - Extension token
6. Click Save connection.

The production extension normalizes unsafe local/IP base URLs back to `https://smartaihub.app`.

## Capture Flow

Category/search page:

1. Open a Shopee or TikTok Shop page yourself.
2. Click Detect.
3. Keep Live detect while scrolling enabled, or click Scan visible products / Scroll & scan more.
4. Let the panel merge newly loaded products as you scroll.
5. Filter/sort candidates, then Open/New tab/Queue/Ignore.
6. Optionally send the candidate list to SmartAIHub.

Product page:

1. Click Detect.
2. Keep Live detect while scrolling enabled so details, variants, review images, and related products appear in the panel as they load.
3. Click Scan & Review, or Use latest detected details.
4. Edit product fields before upload.
5. Review the privacy summary.
6. Select evidence and images to send.
7. Click Upload selected.
8. Review/edit/confirm in SmartAIHub web preview.

## Security Notes

- The extension never stores marketplace cookies or passwords.
- Nothing uploads until the user clicks Upload selected.
- Live detection is read-only and does not create drafts, upload assets, or save products.
- Cart, checkout, account, order, seller, chat, and message pages are blocked by the content adapter and backend source URL validation.
- Production must set `MARKETPLACE_EXTENSION_ALLOWED_ORIGINS` to exact extension origins.
- Keep remote hosted JavaScript out of the extension bundle.
