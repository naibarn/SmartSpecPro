/**
 * Absolute filesystem path to `Root.tsx`, this package's Remotion
 * composition entry point. Consumers pass this directly to
 * `@remotion/bundler`'s `bundle({ entryPoint })` — NOT an `import` of
 * `Root.tsx`'s exports, since `bundle()` needs the raw `.tsx` SOURCE file on
 * disk to webpack-compile (this is how Remotion is designed to work: the
 * composition source ships as-is, `@remotion/bundler`'s own webpack/babel
 * pipeline is the "build step" for it, not `tsc`).
 *
 * Split into its own module (rather than living in `index.ts`) to avoid a
 * circular import with `renderFinalComposite.ts`, which imports this
 * constant and is itself re-exported from `index.ts`.
 *
 * IMPORTANT: this package's actual runtime artifact is the single
 * `esbuild`-bundled `dist/index.js` (see `build.mjs`) — every consumer
 * (this monorepo's `apps/web`, and `apps/worker-app`'s Remotion sidecar)
 * imports that bundle, never `src/rootEntryPoint.ts` directly. Inside the
 * bundle, `import.meta.url` resolves to `dist/index.js`'s own location, so
 * the path is computed relative to `dist/` and stepped back into `src/`
 * (where the raw, unbundled `Root.tsx` SOURCE file must live on disk for
 * `@remotion/bundler` to webpack-compile it) — NOT relative to this
 * source file's own location, which would be wrong once bundled.
 */
import { fileURLToPath } from "node:url";

export const ROOT_ENTRY_POINT = fileURLToPath(
  new URL("../src/Root.tsx", import.meta.url)
);
