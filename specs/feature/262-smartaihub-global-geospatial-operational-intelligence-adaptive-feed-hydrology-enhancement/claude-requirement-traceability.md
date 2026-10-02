# Spec heading and scenario traceability

Generated from active `spec.md` on 2026-10-01. Every Markdown heading is mapped to the implementation section expected to satisfy it. This is a review aid, not implementation evidence.

| Spec line | Heading | Plan section |
|---:|---|---|
| 1 | Spec 262 — SmartAIHub Global Geospatial Operational Intelligence, Adaptive Situation Feed & Hydrology Enhancement | [01-baseline-map-provider.md](sections/section-01-baseline-map-provider.md) |
| 11 | 0. Executive Summary | [01-baseline-map-provider.md](sections/section-01-baseline-map-provider.md) |
| 43 | 1. Scope and Non-Goals | [01-baseline-map-provider.md](sections/section-01-baseline-map-provider.md) |
| 45 | 1.1 In scope | [02-platform-routing-chat-context.md](sections/section-02-platform-routing-chat-context.md) |
| 68 | 1.2 Out of scope | [02-platform-routing-chat-context.md](sections/section-02-platform-routing-chat-context.md) |
| 85 | 2. Non-Negotiable Architectural Invariants | [02-platform-routing-chat-context.md](sections/section-02-platform-routing-chat-context.md) |
| 110 | 3. Reference Architecture | [02-platform-routing-chat-context.md](sections/section-02-platform-routing-chat-context.md) |
| 143 | 4. Map Renderer and Provider Architecture | [01-baseline-map-provider.md](sections/section-01-baseline-map-provider.md) |
| 145 | 4.1 MapLibre remains standard renderer | [01-baseline-map-provider.md](sections/section-01-baseline-map-provider.md) |
| 167 | 4.2 Basemap provider abstraction | [01-baseline-map-provider.md](sections/section-01-baseline-map-provider.md) |
| 182 | 4.3 Google Map Tiles rules | [01-baseline-map-provider.md](sections/section-01-baseline-map-provider.md) |
| 194 | 4.4 Basemap failure behavior | [01-baseline-map-provider.md](sections/section-01-baseline-map-provider.md) |
| 209 | 5. Existing Global Mini Chat Integration | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 211 | 5.1 No Map Chat | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 229 | 5.2 Map Context Bridge | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 278 | 5.3 Contextual language examples | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 292 | 6. Typed Map Command API | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 349 | 7. SmartAIHub React/UI Layer Above MapLibre | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 370 | 7.1 MapOperationalToolbar | [03-map-ux-and-commands.md](sections/section-03-map-ux-and-commands.md) |
| 389 | 7.2 MapContextActionDock | [03-map-ux-and-commands.md](sections/section-03-map-ux-and-commands.md) |
| 403 | 7.3 Journey HUD | [03-map-ux-and-commands.md](sections/section-03-map-ux-and-commands.md) |
| 417 | 7.4 Operational Layer Workbench | [03-map-ux-and-commands.md](sections/section-03-map-ux-and-commands.md) |
| 431 | 7.5 Compare Mode | [03-map-ux-and-commands.md](sections/section-03-map-ux-and-commands.md) |
| 444 | 8. Shared Spatial Focus Context | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 479 | 9. Viewport-Driven Adaptive Feed | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 481 | 9.1 Core principle | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 489 | 9.2 Zoom classes | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 506 | 9.3 Zoom-aware information granularity | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 546 | 9.4 Viewport stabilization | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 559 | 9.5 Feed focus lock | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 575 | 10. Dynamic Relevance Envelope | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 620 | 11. Feed Ranking and Information Load | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 640 | 11.1 Two-layer feed UX | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 642 | Layer A — Situation Digest | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 655 | Layer B — Full Feed | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 661 | 12. Feed Item Model | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 720 | 13. Feed ↔ Map ↔ Chat ↔ Task Contract | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 757 | 14. Situation / News Intelligence | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 776 | 15. Weather Intelligence | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 778 | 15.1 Production baseline | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 792 | 15.2 WeatherNext-class forecast data | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 807 | 15.3 Weather feed behavior | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 829 | 15.4 Strict fact classes | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 845 | 16. Hydrology Time-Series Intelligence | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 849 | 16.1 Canonical observations | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 900 | 16.2 Do not store only the latest value | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 906 | 17. Hydrology Trend Engine | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 963 | 18. Hydrology Material Change Detector | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 984 | 19. Hydro Network Graph | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 986 | 19.1 Basin-first architecture | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 1031 | 19.2 Province is a presentation/administrative boundary | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 1037 | 20. Impact Relevance Graph | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 1071 | 21. Water Propagation | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 1073 | 21.1 P0 deterministic/structural propagation | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 1086 | 21.2 P1/P2 estimated propagation | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 1120 | 22. Hydrologic Impact Corridor and Exposure | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 1165 | 23. Flash Flood Intelligence | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 1194 | 24. Flood Extent Intelligence | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 1218 | 25. Thailand Deep Intelligence Pack | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 1262 | 25.1 Confirmed integration opportunities | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 1277 | 26. Global Base Pack | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 1310 | 27. Geographic Capability Registry | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 1350 | 28. Regional Intelligence Packs | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 1385 | 29. Capability-Adaptive Feed | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 1432 | 30. Data Coverage UI | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 1455 | 31. Thai + English Baseline | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 1457 | 31.1 Mandatory languages | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 1482 | 31.2 Language independent from geography | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 1498 | 31.3 Switching language | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 1513 | 32. Source Language and Translation | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 1542 | 33. Multilingual Geographic Names and Search | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 1570 | 34. Local Businesses and Operational Services | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 1601 | 35. "Why am I seeing this?" Explainability | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 1626 | 36. Watch Area / Watch Route / Watch Condition | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 1658 | 37. Skill-First Capability Families | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 1711 | 38. API / MCP Capability Surface | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 1758 | 39. Data Freshness and Time Semantics | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 1781 | 40. Confidence, Provenance and Uncertainty | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 1809 | 41. Security, Privacy and Sensitive Geography | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 1824 | 42. Provider Rights, Licensing and Attribution | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 1847 | 43. Performance and Cost | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 1849 | 43.1 Viewport/feed efficiency | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 1860 | 43.2 Weather/hydrology ingestion | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 1864 | 43.3 Priority | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 1876 | 44. Observability | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 1906 | 45. Admin Configuration | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 1952 | 46. Incremental Integration with Spec 260 | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 1956 | Phase A — Bridge, no domain rewrite | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 1969 | Phase B — Adaptive Feed | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 1979 | Phase C — Weather | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 1987 | Phase D — Thailand Hydrology | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 2000 | Phase E — Hydro Graph and Propagation | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 2011 | Phase F — Global Rollout | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2020 | Phase G — Localization Completion | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2031 | 47. Priority Matrix | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2033 | P0 | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2054 | P1 | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2068 | P2 | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2079 | 48. Initial Acceptance Tests 1–60 | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2148 | 49. Mandatory End-to-End Scenario | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2168 | 50. Definition of Done | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2189 | Appendix A — Initial Provider Research Snapshot | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 2193 | Google Maps / Weather | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 2202 | Thailand | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 2212 | Global Disaster / Humanitarian | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2219 | Appendix B — Required New Core Objects | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 2252 | Appendix C — Final Product Principle | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 2261 | R1.1 — Research-Hardened Normative Additions | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 2267 | R1.1-1 Research Findings and Design Consequences | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 2281 | R1.1-2 Generic Source Acquisition Framework | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 2332 | Mandatory upstream-write safety | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 2344 | Provider onboarding states | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 2361 | R1.1-3 Thailand National Hydro/Disaster GIS Pack | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 2400 | R1.1-4 Canonical Hydraulic Structure Model | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 2447 | R1.1-5 River Bank, Freeboard, Road/Levee Elevation | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 2480 | R1.1-6 Rainfall, Radar and Short-Horizon Rain Intelligence | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 2496 | Radar nowcast | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 2511 | Multi-source precipitation fusion | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 2517 | R1.1-7 Coastal, Tide and Backwater Intelligence | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 2546 | R1.1-8 Flood Camera and Visual Observation | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 2580 | R1.1-9 Flood Defense and Waterway Obstruction | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 2607 | R1.1-10 Road Passability and Flooded Transport Network | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 2649 | R1.1-11 Transboundary River Context | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 2673 | R1.1-12 Feed Threading and Update-in-Place | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 2698 | Temporal feed lanes | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 2717 | R1.1-13 Basin-Aware Spatial Focus | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 2747 | R1.1-14 Global Regional-Pack Manifest | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 2774 | R1.1-15 Data Quality, Units and Vertical Datum | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 2803 | R1.1-16 Observation, Nowcast, Forecast and Official Warning Taxonomy | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 2834 | R1.1-17 Hydrological Model Governance and Backtesting | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 2864 | R1.1-18 Time-Series Storage and Archive | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 2890 | R1.1-19 Source Health and Fallback Matrix | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 2919 | R1.1-20 Additional Map/Feed UI Components | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 2945 | R1.1-21 Source/Provenance Drawer | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 2968 | R1.1-22 Enhanced API / MCP Surface | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 3004 | R1.1-23 Thailand Provider Research Matrix | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3027 | R1.1-23A Canonical External Entity Binding and Deduplication | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3058 | R1.1-23B Provider Contract Tests and Schema Drift | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3097 | R1.1-23C Catchment Saturation, Terrain and Runoff Context | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 3120 | R1.1-23D Exposure Inventory and Critical Infrastructure | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 3154 | R1.1-23E Flood-Related Water Quality and Public Utility Context | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 3171 | R1.1-23F Hydraulic Operation Event Stream | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3195 | R1.1-24 Revised Priority Matrix | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3197 | P0 — production-critical foundation | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3214 | P1 — operational depth | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3230 | P2 — predictive sophistication | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3242 | R1.1-25 Additional Acceptance Tests 61–140 | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3327 | R1.1-26 Mandatory Integrated Scenarios | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3329 | Scenario A — Multi-province controlled release | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3349 | Scenario B — Mountain flash flood | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 3361 | Scenario C — Coastal rain + high tide | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 3372 | Scenario D — Transboundary Mekong | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 3382 | Scenario E — Source conflict/outage | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3395 | Scenario F — Global limited-coverage country | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 3409 | R1.1-27 Definition of Done | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 3432 | Appendix D — R1.1 Research Sources for Provider Onboarding | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3436 | DDPM / National Disaster GIS | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3444 | RID | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3448 | DWR | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3454 | TMD | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3458 | Tide / terrain-related public datasets | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 3463 | GISTDA | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3467 | Global | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 3474 | Appendix E — R1.1 Core Object Additions | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 3536 | Appendix F — R1.1 Final Product Principle | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 3554 | R1.2 — Twelve-Pass Gap Review and Production Hardening | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 3560 | R1.2 Review Ledger | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 3579 | Pass 1 — Dynamic Hydrologic Topology and Reversible Flow | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 3581 | Gap | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 3585 | Patch | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 3639 | Pass 2 — Urban Drainage and Pluvial Flood Intelligence | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 3641 | Gap | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 3645 | Patch | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 3694 | Pass 3 — Sensor Asset Lifecycle, Calibration and Late Data | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 3696 | Gap | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 3700 | Patch | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 3754 | Pass 4 — Standards-First Global Interoperability | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 3756 | Gap | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 3760 | Patch | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 3790 | Pass 5 — Feed/Watch Attention Budget, Hysteresis and Reproducibility | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 3792 | Gap | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 3796 | Patch | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 3844 | Pass 6 — Offline, Low-Bandwidth and Accessibility Completion | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 3846 | Gap | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 3850 | Patch | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 3885 | Pass 7 — Ingestion Security, Viewport Privacy and Manipulation Resistance | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 3887 | Gap | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 3891 | Patch | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 3935 | Pass 8 — Forecast Run Lifecycle, Supersession and Verification | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 3937 | Gap | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 3941 | Patch | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 3994 | Pass 9 — Jurisdiction, Data Residency and Localization Policy | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 3996 | Gap | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 4000 | Patch | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 4034 | Pass 10 — Provider Release Engineering, SLOs, Budgets and Canary | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 4036 | Gap | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 4040 | Patch | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 4089 | Pass 11 — Spatial/Temporal Partitioning and Revision-Aware Recompute | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 4091 | Gap | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 4095 | Patch | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 4121 | Pass 12 — Version Compatibility, Disaster-Time Rollback and Final Production Gate | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 4123 | Gap | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 4127 | Patch | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 4154 | R1.2 Additional Acceptance Tests 141–200 | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4219 | R1.2 Mandatory Integrated Scenarios | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4221 | Scenario G — Controlled canal reversal in an urban flood | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4225 | Scenario H — Late sensor correction during an active watch | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 4229 | Scenario I — New-country standards-based onboarding | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 4233 | Scenario J — Attack against public-source ingestion | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 4237 | Scenario K — Provider canary during a regional flood | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 4241 | Scenario L — Offline bilingual public safety | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 4247 | R1.2 Revised Definition of Done | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4271 | Appendix G — R1.2 Core Object Additions | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4305 | Appendix H — R1.2 Standards Profile | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 4328 | R1.2 Final Principle | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4333 | R1.3 — Second Twelve-Pass Gap Review / 24-Pass Cumulative Hardening | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4339 | R1.3 Review Ledger | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4358 | Pass 13 — Cross-Surface Projection Consistency and Stale-Action Revalidation | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4360 | Gap | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4366 | Patch | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4420 | Pass 14 — Strict Simulation / What-If Isolation | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4422 | Gap | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4426 | Patch | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 4480 | Pass 15 — Compound Hazards and Cascading Infrastructure Dependencies | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4482 | Gap | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4503 | Patch | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4553 | Pass 16 — Coverage Bias, Observation Density and Rural/Low-Connectivity Fairness | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 4555 | Gap | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 4559 | Patch | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 4602 | Pass 17 — Hydraulic Operation Plan Lifecycle, Rule References and Plan-vs-Observed Variance | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 4604 | Gap | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 4608 | Patch | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 4672 | Pass 18 — Uncertainty Propagation, Threshold Semantics and False Precision Control | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4674 | Gap | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4678 | Patch | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4746 | Pass 19 — Global Hydrological Driver Taxonomy | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4748 | Gap | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4752 | Patch | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4808 | Pass 20 — Global Geo Normalization: Antimeridian, Polar Regions, Geodesic Metrics and CRS Safety | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 4810 | Gap | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 4814 | Patch | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 4846 | Pass 21 — Multilingual Terminology Integrity and Translation Quality | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 4848 | Gap | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 4852 | Patch | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 4902 | Pass 22 — Geospatial / Provider / Topology Operator Overrides and Reconciliation | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4904 | Gap | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4908 | Patch | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4954 | Pass 23 — Tenant Safety Non-Regression and Configuration Policy Gate | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 4956 | Gap | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 4960 | Patch | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 5010 | Pass 24 — Situation Replay, Projection Manifest and Decision Reconstruction | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 5012 | Gap | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 5020 | Patch | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 5077 | R1.3 Revised Priority Matrix | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 5079 | P0 — correctness and authority isolation | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 5092 | P1 — operational intelligence depth | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 5102 | P2 — advanced modeling | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5114 | R1.3 Additional Acceptance Tests 201–260 | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 5190 | R1.3 Mandatory Integrated Scenarios | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 5192 | Scenario M — Cross-surface correction during active evacuation planning | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5196 | Scenario N — Command-center what-if dam release | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 5200 | Scenario O — Rural flash-flood coverage gap | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5204 | Scenario P — Compound urban/coastal flooding | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5208 | Scenario Q — Global cold-region Regional Pack | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 5212 | Scenario R — Human correction and post-incident replay | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5218 | R1.3 Revised Definition of Done | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 5239 | Appendix I — R1.3 Core Object Additions | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5282 | Appendix J — R1.3 Safety Classification Additions | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 5304 | R1.3 Final Principle | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 5310 | R1.4 — Third Twelve-Pass Gap Review / 36-Pass Cumulative Hardening | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 5316 | R1.4 Review Ledger | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 5335 | Pass 25 — Rating Curves, Gaugings and Stage–Discharge Semantics | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 5337 | Gap | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 5343 | Patch | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 5422 | Pass 26 — Hydraulic Sections, Bathymetry, Roughness and Flood-Defense Geometry | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5424 | Gap | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5428 | Patch | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5499 | Pass 27 — Hydraulic Balance and Physical-Plausibility Checks | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5501 | Gap | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5505 | Patch | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5563 | Pass 28 — Event-Time Watermarks, Source Clock Quality, Backfill and Reprocessing | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 5565 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 5569 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 5637 | Pass 29 — Probabilistic Forecast Verification, Calibration and Exceedance Semantics | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5639 | Gap | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5643 | Patch | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5722 | Pass 30 — Assimilated Analysis Fields and Non-Independence of Evidence | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5724 | Gap | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5728 | Patch | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5780 | Pass 31 — Temporal Exposure, Population Presence and Facility Capacity | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5782 | Gap | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5786 | Patch | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5848 | Pass 32 — Spatial Disclosure, Generalization and Anti-Reconstruction | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 5850 | Gap | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 5854 | Patch | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 5904 | Pass 33 — Provider and Regional-Pack Lifecycle, Retirement and Rights Change | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 5906 | Gap | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 5910 | Patch | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 5974 | Pass 34 — Data Artifact Integrity, Offline Package Trust and Import Boundaries | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 5976 | Gap | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 5980 | Patch | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 6042 | Pass 35 — Canonical Data-Quality Incident and Bounded Recovery/Rebuild | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 6044 | Gap | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 6048 | Patch | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 6120 | Pass 36 — Stable Geospatial References, Boundary Evolution and Watch Migration | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 6122 | Gap | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 6126 | Patch | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 6196 | R1.4 Standards and Research Alignment | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 6216 | R1.4 Revised Priority Matrix | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 6218 | P0 — operational correctness | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 6230 | P1 — hydrological/model depth | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 6239 | P2 — advanced modeling | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 6251 | R1.4 Additional Acceptance Tests 261–320 | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 6327 | R1.4 Mandatory Integrated Scenarios | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 6329 | Scenario S — Rating-curve shift after major flood | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 6333 | Scenario T — Out-of-order telemetry after network outage | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 6337 | Scenario U — Radar/gauge analysis and calibrated forecast | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 6341 | Scenario V — Sensitive evacuation origin and public map differencing | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 6345 | Scenario W — Provider license/retirement during an active watch | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 6349 | Scenario X — Normalization bug and canonical rebuild | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 6355 | R1.4 Revised Definition of Done | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 6376 | Appendix K — R1.4 Core Object Additions | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 6428 | Appendix L — R1.4 Fact-Class Extensions | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 6453 | R1.4 Final Principle | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 6459 | R1.5 — Fourth Twelve-Pass Gap Review / 48-Pass Cumulative Hardening | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 6465 | R1.5 Review Ledger | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 6484 | Pass 37 — WMO WIS2 / WHOS and OGC API EDR / PubSub Interoperability | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 6486 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 6492 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 6574 | Pass 38 — CAP Alert Lifecycle, Authority Identity, Scope and Multilingual Reconciliation | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 6576 | Gap | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 6580 | Patch | [12-localization-and-geographic-search.md](sections/section-12-localization-and-geographic-search.md) |
| 6666 | Pass 39 — Operational Event Stream Semantics, Replay, Gap Detection and Consumer Cursors | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 6668 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 6672 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 6743 | Pass 40 — Mass Evacuation, Clearance Time, Route Capacity, Contraflow and Receiving Capacity | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 6745 | Gap | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 6749 | Patch | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 6841 | Pass 41 — Operational Model Registry, Executable Artifact Identity and Deployment Governance | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 6843 | Gap | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 6847 | Patch | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 6923 | Pass 42 — Reference Map Conflation, Operational Network Binding and Basemap Drift | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 6925 | Gap | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 6929 | Patch | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 6985 | Pass 43 — Water Quality, Sanitation, Potable-Water and Wastewater Intelligence | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 6987 | Gap | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 6991 | Patch | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 7063 | Pass 44 — Canonical Concept Registry, Provider Code Mapping and Taxonomy Versioning | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 7065 | Gap | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 7069 | Patch | [04-viewport-adaptive-feed.md](sections/section-04-viewport-adaptive-feed.md) |
| 7139 | Pass 45 — Jurisdiction Authority Matrix, Cross-Border Hazards and Boundary Ambiguity | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 7141 | Gap | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 7145 | Patch | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 7201 | Pass 46 — Exercise, Drill, Test and Training Isolation | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 7203 | Gap | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 7207 | Patch | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 7260 | Pass 47 — Warning Delivery Assurance, Channel Reachability and Dissemination Diagnostics | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 7262 | Gap | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 7266 | Patch | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 7323 | Pass 48 — Hydrological Observation Retention, Downsampling and Extremes Preservation | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 7325 | Gap | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 7329 | Patch | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 7400 | R1.5 Revised Priority Matrix | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7402 | P0 — interoperability and operational correctness | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7415 | P1 — regional response capability | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7425 | P2 — advanced coordination | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7437 | R1.5 Additional Acceptance Tests 321–380 | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7513 | R1.5 Mandatory Integrated Scenarios | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7515 | Scenario Y — Cross-border WIS2/WHOS river event | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7519 | Scenario Z — CAP update/cancel during multi-channel dissemination | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7523 | Scenario AA — Regional mass evacuation under degrading flood conditions | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 7527 | Scenario AB — Operational model canary and reference-map drift | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 7531 | Scenario AC — Flood recession followed by water-quality emergency | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 7535 | Scenario AD — Exercise plus high-frequency retention | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 7541 | R1.5 Revised Definition of Done | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7562 | Appendix M — R1.5 Core Object Additions | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7610 | Appendix N — R1.5 Global Interoperability Profile | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 7635 | Appendix O — R1.5 Research References for Implementation Revalidation | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7650 | R1.5 Final Principle | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7656 | R1.6 — Fifth Twelve-Pass Gap Review / 60-Pass Cumulative Hardening | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7662 | R1.6 Review Ledger | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 7681 | Pass 49 — Geospatial Resource Catalog and Interoperable Provenance | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7683 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7687 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7786 | Pass 50 — Remote-Sensing Acquisition Geometry, Quality Masks and Processing Provenance | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7788 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7794 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7887 | Pass 51 — Provider Transition, Measurement Harmonization and Cross-Calibration | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 7889 | Gap | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 7895 | Patch | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 7960 | Pass 52 — Numerical Conflict Sets, Redundant Sensors and Source Correlation | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7962 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7966 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8034 | Pass 53 — Spatial Support, Resolution, Resampling and Aggregation Semantics | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8036 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8040 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8111 | Pass 54 — Offline Field Outbox, Resumable Media and Sync Conflict Reconciliation | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 8113 | Gap | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 8117 | Patch | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 8206 | Pass 55 — Geo/Hydrology Business Continuity and Disaster-Recovery Readiness | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 8208 | Gap | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 8212 | Patch | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 8279 | Pass 56 — Provider Credential, Session and Authentication Rotation Lifecycle | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 8281 | Gap | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 8285 | Patch | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 8353 | Pass 57 — Emergency Feature Controls, Kill-Switch Expiry and Configuration Change Governance | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 8355 | Gap | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 8359 | Patch | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 8424 | Pass 58 — Plain-Language, Cognitive Accessibility and High-Stress Message Presentation | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 8426 | Gap | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 8430 | Patch | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 8486 | Pass 59 — Provenance Graph Scalability, Content-Addressed Lineage and Replay Bundles | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8488 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8492 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8546 | Pass 60 — Geospatial Conformance Corpus, Golden Scenarios and Release Evidence | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8548 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8552 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8647 | R1.6 Standards and Research Alignment | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 8663 | R1.6 Revised Priority Matrix | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 8665 | P0 — hidden correctness and recovery | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 8680 | P1 — operational tooling | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 8691 | P2 — advanced automation | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 8703 | R1.6 Additional Acceptance Tests 381–440 | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 8779 | R1.6 Mandatory Integrated Scenarios | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 8781 | Scenario AE — Remote-sensing blind spot during active flood | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 8785 | Scenario AF — Provider transition during river rise | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 8789 | Scenario AG — Conflicting redundant gauges | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 8793 | Scenario AH — Responder report created fully offline | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 8797 | Scenario AI — Regional platform recovery during external-provider degradation | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 8801 | Scenario AJ — Production release blocked by hidden semantic regression | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 8807 | R1.6 Revised Definition of Done | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 8828 | Appendix P — R1.6 Core Object Additions | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 8872 | Appendix Q — R1.6 Research References for Implementation Revalidation | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8887 | R1.6 Final Principle | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 8893 | R1.7 — Sixth Twelve-Pass Gap Review / 72-Pass Cumulative Hardening | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 8899 | R1.7 Review Ledger | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 8918 | Pass 61 — Freshness-Based Operational Action Gating | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 8920 | Gap | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 8926 | Patch | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 8993 | Pass 62 — Missing Data, Censoring, Detection Limits and Imputation Semantics | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 8995 | Gap | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 8999 | Patch | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 9086 | Pass 63 — Drought, Low-Flow, Salinity Intrusion and Water-Availability Intelligence | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 9088 | Gap | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 9092 | Patch | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 9176 | Pass 64 — Geofence Transitions and Watch Lifecycle Semantics | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 9178 | Gap | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 9182 | Patch | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 9269 | Pass 65 — Offline Basemap, Vector, Critical-Data and Incremental Region Packages | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 9271 | Gap | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 9275 | Patch | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 9332 | Pass 66 — Federated Inter-Agency / Cross-Tenant Situation Exchange | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9334 | Gap | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9338 | Patch | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9413 | Pass 67 — Platform-Wide Work Admission, Compute Budgets and Disaster Load Shedding | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 9415 | Gap | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 9419 | Patch | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 9503 | Pass 68 — Source Heartbeats, Planned Maintenance and Expected Silence | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 9505 | Gap | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 9509 | Patch | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 9576 | Pass 69 — Spatial Interaction Telemetry Privacy | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9578 | Gap | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9582 | Patch | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9643 | Pass 70 — Cross-Device / Cross-Session Spatial State Synchronization | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 9645 | Gap | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 9649 | Patch | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 9715 | Pass 71 — Non-Visual Spatial Narrative and Accessible Map Equivalence | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 9717 | Gap | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 9721 | Patch | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 9786 | Pass 72 — Privacy Deletion, Legal Hold and Emergency Evidence Retention Conflict | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9788 | Gap | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9792 | Patch | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9860 | R1.7 Revised Priority Matrix | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 9862 | P0 — operational integrity and user safety | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 9874 | P1 — national/global capability depth | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 9882 | P2 — advanced coordination | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 9894 | R1.7 Additional Acceptance Tests 441–500 | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 9970 | R1.7 Mandatory Integrated Scenarios | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 9972 | Scenario AK — Stale-data route decision | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 9976 | Scenario AL — Data gap during rapidly rising river | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 9980 | Scenario AM — Dry-season salinity and water-supply stress | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 9984 | Scenario AN — Watch area on several devices | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 9988 | Scenario AO — Cross-agency flood exchange under platform surge | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 9992 | Scenario AP — Public accessibility and privacy after an emergency | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 9998 | R1.7 Revised Definition of Done | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 10019 | Appendix R — R1.7 Core Object Additions | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 10068 | R1.7 Final Principle | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 10076 | R1.8 — Spec 260 Alignment and Existing AI Chat & Feedback Integration | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 10080 | R1.8.1 Spec 260 dependency and change control | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 10091 | R1.8.2 Existing AI Chat & Feedback panel contract | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 10100 | R1.8.3 Acceptance tests 501–513 | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 10116 | R1.8.4 Integrated chat scenarios | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 10118 | Scenario AQ — Map question in the existing shared panel | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 10122 | Scenario AR — Public map with existing Chat access requirements | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 10126 | R1.8.5 Revised completion and sequencing criteria | [18-integrated-acceptance-release-evidence.md](sections/section-18-integrated-acceptance-release-evidence.md) |
| 10139 | R1.8.6 Ten-round gap review record | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |

## Integrated scenario coverage (44 scenarios)

| Spec line | Scenario ID | Scenario | Plan section |
|---:|---|---|---|
| 3329 | A | Scenario A — Multi-province controlled release | [09-thailand-provider-pack.md](sections/section-09-thailand-provider-pack.md) |
| 3349 | B | Scenario B — Mountain flash flood | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 3361 | C | Scenario C — Coastal rain + high tide | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 3372 | D | Scenario D — Transboundary Mekong | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 3382 | E | Scenario E — Source conflict/outage | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 3395 | F | Scenario F — Global limited-coverage country | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 4221 | G | Scenario G — Controlled canal reversal in an urban flood | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 4225 | H | Scenario H — Late sensor correction during an active watch | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 4229 | I | Scenario I — New-country standards-based onboarding | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 4233 | J | Scenario J — Attack against public-source ingestion | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 4237 | K | Scenario K — Provider canary during a regional flood | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 4241 | L | Scenario L — Offline bilingual public safety | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 5192 | M | Scenario M — Cross-surface correction during active evacuation planning | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5196 | N | Scenario N — Command-center what-if dam release | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 5200 | O | Scenario O — Rural flash-flood coverage gap | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 5204 | P | Scenario P — Compound urban/coastal flooding | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 5208 | Q | Scenario Q — Global cold-region Regional Pack | [11-global-regional-capabilities.md](sections/section-11-global-regional-capabilities.md) |
| 5212 | R | Scenario R — Human correction and post-incident replay | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 6329 | S | Scenario S — Rating-curve shift after major flood | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 6333 | T | Scenario T — Out-of-order telemetry after network outage | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 6337 | U | Scenario U — Radar/gauge analysis and calibrated forecast | [05-feed-semantics-and-weather.md](sections/section-05-feed-semantics-and-weather.md) |
| 6341 | V | Scenario V — Sensitive evacuation origin and public map differencing | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 6345 | W | Scenario W — Provider license/retirement during an active watch | [16-provider-admin-operations.md](sections/section-16-provider-admin-operations.md) |
| 6349 | X | Scenario X — Normalization bug and canonical rebuild | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 7515 | Y | Scenario Y — Cross-border WIS2/WHOS river event | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7519 | Z | Scenario Z — CAP update/cancel during multi-channel dissemination | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 7523 | AA | Scenario AA — Regional mass evacuation under degrading flood conditions | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 7527 | AB | Scenario AB — Operational model canary and reference-map drift | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 7531 | AC | Scenario AC — Flood recession followed by water-quality emergency | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 7535 | AD | Scenario AD — Exercise plus high-frequency retention | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 8781 | AE | Scenario AE — Remote-sensing blind spot during active flood | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 8785 | AF | Scenario AF — Provider transition during river rise | [06-source-acquisition-durable-jobs.md](sections/section-06-source-acquisition-durable-jobs.md) |
| 8789 | AG | Scenario AG — Conflicting redundant gauges | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 8793 | AH | Scenario AH — Responder report created fully offline | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 8797 | AI | Scenario AI — Regional platform recovery during external-provider degradation | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 8801 | AJ | Scenario AJ — Production release blocked by hidden semantic regression | [17-model-governance-replay-recovery.md](sections/section-17-model-governance-replay-recovery.md) |
| 9972 | AK | Scenario AK — Stale-data route decision | [10-compound-hazards-and-exposure.md](sections/section-10-compound-hazards-and-exposure.md) |
| 9976 | AL | Scenario AL — Data gap during rapidly rising river | [08-hydro-network-impact.md](sections/section-08-hydro-network-impact.md) |
| 9980 | AM | Scenario AM — Dry-season salinity and water-supply stress | [07-hydrology-observations-timeseries.md](sections/section-07-hydrology-observations-timeseries.md) |
| 9984 | AN | Scenario AN — Watch area on several devices | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 9988 | AO | Scenario AO — Cross-agency flood exchange under platform surge | [14-privacy-federation-retention.md](sections/section-14-privacy-federation-retention.md) |
| 9992 | AP | Scenario AP — Public accessibility and privacy after an emergency | [15-offline-accessibility-device-sync.md](sections/section-15-offline-accessibility-device-sync.md) |
| 10118 | AQ | Scenario AQ — Map question in the existing shared panel | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |
| 10122 | AR | Scenario AR — Public map with existing Chat access requirements | [13-watches-api-mcp-chat-actions.md](sections/section-13-watches-api-mcp-chat-actions.md) |

## Coverage audit

- 496 Markdown headings and all 44 integrated scenarios are mapped.
- The separate `claude-acceptance-traceability.md` maps every test ID 1–513. Section owners must correct any semantic misroute and update traceability when implementation boundaries change.
- No mapping is proof of implementation; each row requires code/test/browser/runtime evidence or a typed owner-approved deferral.
