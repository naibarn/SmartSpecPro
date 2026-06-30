# Orchestra Contracts

## Dashboard Responsive Contract

- Core dashboard content must not be hidden solely because viewport width is below 1280px.
- The 1280px media query may control fixed desktop sidebar and desktop-only visual motion.
- Analytics/admin sections remain governed by auth, role, tenant, and feature flags, not by tablet/mobile width.
- Tests must include a tablet-style `matchMedia("(min-width: 1280px)") === false` regression case.
