# Section 03 — Admin UI

## Ownership

- `apps/web/client/src/pages/AdminDatabaseBackups.tsx`
- `apps/web/client/src/App.tsx`
- shared menu definition and `apps/web/client/src/hooks/useMenuItems.ts` only if required
- `apps/web/client/src/locales/th/nav.json`
- `apps/web/client/src/locales/en/nav.json`
- `apps/web/client/src/locales/th/admin.json`
- `apps/web/client/src/locales/en/admin.json`
- related page tests

## UI/UX Contract

### Target User / JTBD
- Role: admin
- Goal: create and download either database ZIP without shell access
- Entry point: Admin menu > Database Backups
- Success outcome: completed row exposes two independent download buttons

### Existing Pattern Reference
- Searched: `AdminCommandCenter`, `AdminQueueDashboard`, `useMenuItems`, existing admin page tests
- Found: admin dashboard cards, badges, async query/mutation patterns and shared menu resolver
- Decision: reuse

### Surface Inventory
| Surface | Route/file | Change |
|---|---|---|
| Admin page | `/admin/database-backups` | new page |
| Admin navigation | shared menu definition + nav locale | new admin item |

### Component Map
| Component | Owns | Consumes |
|---|---|---|
| `AdminDatabaseBackups` | form, polling, table, status actions | `databaseBackups` tRPC + download route |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton/spinner | page test |
| empty | explanation + create CTA | page test |
| queued/running | status badge, disabled duplicate action as appropriate | page test |
| success | two download buttons, sizes, expiry | page test |
| error/expired | safe error/expired label, no download | page test |
| focus/hover/disabled | visible semantic button states | manual/browser |

### Responsive Matrix
| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | cards/rows stack, actions wrap, no horizontal scroll |
| tablet 768x1024 | compact table/card hybrid |
| desktop 1440x900 | full-width readable table |
| small-mobile 360x800 | extended check for action wrapping |
| laptop 1024x768 | extended check for dense row layout |
| wide-desktop 1280x800 | extended check for table overflow |

### Accessibility Acceptance
- semantic heading and labeled mode control
- keyboard reaches create and each download action in logical order
- visible focus ring and non-color-only status labels
- full-mode warning is announced near the control

### Copy Contract
- Thai primary strings with English fallback
- labels: `สำรองข้อมูล`, `โหมดปลอดภัย`, `โหมดเต็ม`, `ดาวน์โหลดฐานข้อมูล`, `ดาวน์โหลดข้อมูลแอป`
- errors do not expose SQL, paths or credentials

### Browser Evidence Required
Attempt Playwright/manual evidence using `orchestra/ui-browser-evidence.md` for required and extended viewports.
