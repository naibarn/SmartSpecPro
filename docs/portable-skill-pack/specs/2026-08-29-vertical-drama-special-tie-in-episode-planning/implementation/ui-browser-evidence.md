# UI browser evidence

Date: 2026-08-29

The production browser pass is not claimed here. No authenticated Playwright session
was available for the target tenant/series, so the following remain pending live evidence:

- 390x844, 768x1024, 1440x900, 360x800, 1024x768, and 1280x800 layouts
- keyboard focus order, modal focus restore, drag/drop, and screen-reader announcements
- Marketplace product search, product image selection, aggregate 1–3 cap, and managed-media preview
- special prompt polling/partial/error states and normal episode entry regression
- browser console, network authorization, and provider-backed render behavior

Static/browser-build evidence completed: Vite client and widget builds passed; the dialog has
labels, keyboard-selectable buttons/checkboxes, a file-input fallback, scrollable modal body,
visible loading/disabled controls, and no URL input. A live browser run is still required
before release/deployment.
