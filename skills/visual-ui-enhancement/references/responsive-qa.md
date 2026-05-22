# Responsive QA

Use the canonical viewport policy shared with Orchestra UI gates.

Required for route-level, async, responsive, accessibility, and visual-polish work:

- 390x844 mobile
- 768x1024 tablet
- 1440x900 desktop

Extended checks when the layout is dense, table-heavy, sidebar-heavy, canvas-based, or near a
breakpoint boundary:

- 360x800 small mobile
- 1024x768 laptop boundary
- 1280x800 wide desktop

## Patterns

- Desktop grids collapse to one column or priority groups.
- Tables become cards, priority columns, or safe horizontal scroll.
- Sidebars become Sheet/drawer/collapsible rail.
- Forms become single-column on mobile.
- Touch targets are at least 44px tall.
- Important CTA remains visible but not intrusive.
- Text does not overflow containers.
- Sticky elements do not cover form fields or CTAs.
