# Test Design — Website Completion Continuation

| Requirement | Observable behavior | Level/location | GREEN evidence | Residual boundary |
|---|---|---|---|---|
| Public entry routes | Landing CTA and resource links use registered public/auth paths | Home component tests; route source audit; public sitemap tests | `Home.test.tsx`, `publicSitemap.test.ts`, browser `/` + `/signup` route smoke passed | Vite route smoke does not prove deployed routing |
| Truthful public copy | Home/shell/signup avoid unsupported named capabilities and signup statistics | `publicSite.test.ts`, `smartaihubPublicTruth.test.ts` | Focused truth and locale tests pass; removed signup claims verified in browser | External claim/rights owner approval remains outside repo |
| Locale parity and metadata | EN/TH copy and SEO agree; hydrated document has one localized description | Locale tests; Home/Seo tests; browser smoke | 25 tests pass; EN/TH browser checks show one correct description and localized title | Search engine/CDN crawl behavior not tested |
| Tenant-independent public SEO | Homepage does not inherit tenant-specific SEO values/images | `Seo.test.tsx`, Home source/test | Test with tenant defaults verifies fixed SmartAIHub metadata and no image | Other public routes keep their existing tenant SEO behavior |
| Registration policy copy | CTA remains neutral; invite-only message requires confirmed policy; API error stays neutral | Locale regression test; Signup source; Vite browser smoke | Runtime-mode review gap repaired; focused suite passes; dev no-API state shows unavailable message | Live backend registration was not exercised |
| Public prerender shell | Static crawler snapshot has the public title, description and home content | `publicSeoPrerender.test.ts` | Prerender tests pass | No production crawler/CDN verification |
| Responsive baseline | No horizontal overflow at narrow viewport | Playwright against Vite source at 390px | EN/TH Home and Signup route observed at width 390 with no overflow | Not full device/browser/accessibility certification |
| Type checking/build | Final code compiles into production artifacts | Not run | Deferred explicitly by user instruction; do not infer passing | Build and deployed bundle remain unverified |

No TypeScript typecheck was run; repository AGENTS.md restricts it due to RAM. No production backend, paid provider, or credential was used.
