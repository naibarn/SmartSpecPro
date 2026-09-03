# Implementation audit round 12 — unified shot reference surface

- Rechecked the latest product requirement: a shot must not present separate
  Product tie-in and Prop/Object Reference surfaces. The storyboard now mounts
  one wide `ShotObjectReferenceCard` for both normal and Special shots.
- Product images and `prop_object` images are normalized into one visual list and
  one drop/upload strip. The user can choose whether a dropped image is stored
  as a Product reference or a story Object reference, while the existing
  Product tie-in persistence contract remains compatible underneath.
- The existing Product picker, object catalog selector, drag/drop, upload,
  remove, and non-blocking loading/error behavior are all exposed from the
  shared card. The page callback for Product drag/upload is now forwarded
  through the Episode Workspace to the storyboard panel.
- Focused UI/data regression: 8 files passed, 165 tests passed. The two
  storyboard UI suites passed 28/28, including the one-card/one-list assertions.
- Vite production client build passed after the final wiring change.
- Full repository typecheck, authenticated browser proof, live provider proof,
  migration application, and paid generation remain explicit environment gates
  and were not triggered by this UI change.

Result: PASS for the requested unified Product/Object shot surface. No second
shot-level Product/Object collection remains in the inspected storyboard path.
