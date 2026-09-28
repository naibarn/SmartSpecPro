# Research Notes

- Production URL and `/health` return HTTP 200, but the authenticated product-detail UI reaches the application error boundary. Severity: SEV-2 feature outage.
- The console reports React minified error 310, consistent with a hook-order change between renders.
- `MarketplaceCaptureProductDetail.tsx` returns early while `product.isLoading` or when product data is absent.
- Feature 136 commit `70177883a` added five hooks after those early returns: four `useMemo` calls and one `useCallback` call.
- The loading render skips the hooks; the loaded render invokes them. This is the direct Rules of Hooks violation.
- Existing page tests intentionally use source-level wiring checks because the page is over 8,500 lines and is not mounted in jsdom.
- No authentication, tenant boundary, API contract, database schema, or persisted data changes are required.
- SocratiCode discovery was attempted but failed with `Transport closed`; targeted source and Git inspection were used instead.
