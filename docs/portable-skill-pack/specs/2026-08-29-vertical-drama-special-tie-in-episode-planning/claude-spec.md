# Synthesized specification — Vertical Drama special tie-in episode

Add an additive `special_tie_in` episode kind to Vertical Drama. A special episode is
created from a user idea/brief rather than a Story Bible overview entry and is intended
for product, location, or store tie-ins. The existing normal episode flow, numbering,
prompt workflow, model memory, and nine-shot duration assumptions must remain unchanged.

The special creation dialog accepts an idea up to 5,000 characters, one to three managed
product/location/store reference images selected either by upload/drop slot or through a
searchable Marketplace Capture product-and-image picker, series character references,
8/10/12/15/20/24/30-second shot duration, 9:16, dialogue mode, up to four selected
speaking candidates with no more than three actual speakers, optional non-speaking
characters/background extras, and explicit image/video model IDs. It also supports
identity/product/location locks.

The server persists a special-only input envelope, model snapshot, creation intent and
input/output versions, and uses a dedicated durable interactive job scope. The adapter
loads and validates the local `idea-to-video-prompt` package, resolves authorized managed
reference URLs at execution time, invokes the skill, validates output, and persists its
shot count and prompts into the existing start-frame and motion prompt contracts. One
start-frame prompt and one video prompt are generated per returned shot; rendering remains
explicit and uses existing credit/provider gates.

Special location/store assets create or reconcile a reusable slot in the series Scenes
tab using canonical media assets. Creation is idempotent and stale job results cannot
overwrite newer input. Existing records are backfilled as normal with no behavioral
change. The feature is flag-gated, tenant-safe, observable, retryable, and tested across
contract, DB, service, API, Marketplace Capture, UI, accessibility, and integration
boundaries.
