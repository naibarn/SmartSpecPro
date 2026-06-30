# Astryx Adoption

## Setup

SmartSpecPro uses Astryx as an opt-in React design-system layer for new or
refactored product UI. Existing routes, auth, tRPC, SSE, Cloudflare, Neon, and
tenant behavior stay owned by SmartSpecPro.

Use the npm script from the repository root:

```bash
npm run astryx -- <command>
```

For the web workspace:

```bash
npm run --workspace @smartspec/web astryx -- <command>
```

## Selected Templates

Use these first when improving SmartSpecPro admin, media, queue, and workflow
surfaces:

- `dashboard`: best base for KPI cards, charts, and analytics tables.
- `table-grouped`: best base for queues, approvals, task lists, status groups,
  filters, and resizable detail panels.
- `ai-chat`: useful for agent/tool-call experiences and generation workspaces.
- `MediaThemeImageOverlay`: useful for generated image/video preview cards.
- `StatusDotPulsing`: useful for live, processing, failed, or stalled jobs.

## Component Shortlist

- `AppShell`: app-level frame when building a new full route shell.
- `Layout`, `Grid`, `VStack`, `HStack`: layout primitives before custom divs.
- `Table`, `PowerSearch`, `Pagination`: dense operational data surfaces.
- `DateRangeInput`: reporting and analytics filters.
- `Lightbox`, `Overlay`, `MediaTheme`: media review and preview workflows.
- `ChatToolCalls`: AI agent trace and tool-call visibility.
- `Banner`, `Toast`, `StatusDot`, `Badge`: user feedback and status.

## Agent Workflow

Before writing new UI code, run:

```bash
npm run astryx -- search "<feature idea>" --json --dense
npm run astryx -- template --list --json --dense
npm run astryx -- build "<feature idea>" --dense
```

Then inspect the closest template and component docs:

```bash
npm run astryx -- template <template-name> --skeleton --json --dense
npm run astryx -- component <ComponentName> --json --dense
```

Prefer adapting the selected template skeleton into existing SmartSpecPro
components instead of copying a full page over existing routes.
