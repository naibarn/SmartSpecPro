// Augments vitest's Assertion interface with @testing-library/jest-dom matchers.
//
// Cannot use /// <reference types="@testing-library/jest-dom/vitest" /> because
// jest-dom is hoisted to the monorepo root node_modules where vitest is NOT
// installed, so the `import 'vitest'` inside jest-dom's vitest.d.ts silently
// fails to resolve the augmentation target.
//
// `export {}` makes this a MODULE file (not a global script). In a module file,
// `declare module "vitest"` is a module AUGMENTATION (merges with vitest's types)
// rather than an ambient module declaration (which would replace them entirely).
// TypeScript applies augmentations from all files in the compilation automatically,
// so no explicit import of this file is needed anywhere.
export {};
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<R = any>
    extends import("@testing-library/jest-dom").TestingLibraryMatchers<unknown, R> {}
  interface AsymmetricMatchersContaining
    extends import("@testing-library/jest-dom").TestingLibraryMatchers<unknown, unknown> {}
}
