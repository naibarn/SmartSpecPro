# Section 06 — Geospatial Map and Public Projections

**Dependencies:** Sections 03–04. **Owner:** conductor. **Status:** In progress (bounded PostGIS viewport and nearby, generalized coordinates, MapLibre clustering, alert point and public Polygon/MultiPolygon overlays, generalized facility fallback coordinates, explicit truncation state, tenant-local public search, and visible in-session stale fallback are implemented; persistent cache freshness and full list/map parity remain open).

## Scope

Implement PostGIS viewport, nearby and search contracts; privacy-safe generalized public geometry; source and freshness disclosure; clustering/LOD; alert geometry; public facility discovery; basemap adapter configuration; MapLibre map rendering; and a keyboard-accessible list equivalent. Public and operations projections must remain separate. A map provider outage leaves a usable list and explicit unavailable/stale state.

## Exit criteria

- Queries enforce tenant and jurisdiction scope, bounded viewport dimensions and maximum result counts.
- Public DTOs expose only intentionally generalized coordinates and never operational or reporter coordinates.
- Cached data includes source and freshness; stale cache cannot be displayed as current.
- Map and list expose equivalent public-safe items; no marker absence implies safety.
- Provider style/binding choice is configuration-driven and fails closed; local fixtures drive tests without Cloudflare access.

Alert areas are operator-authored GeoJSON Polygon/MultiPolygon features stored as public geometry, validated and bounded before persistence, snapped to the shared 0.05-degree privacy grid before every public projection, and rendered in a separate non-clustered MapLibre fill/outline source. The dashboard command route now exposes alert draft/publish/cancel and affected-area authoring. Integration evidence remains deferred to the final local release-candidate pass.
