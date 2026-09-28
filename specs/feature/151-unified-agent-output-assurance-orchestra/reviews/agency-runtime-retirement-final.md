# Agency runtime retirement closeout

Implemented the final decommission boundary after the assurance/orchestra
foundation landed:

- Removed `agency-swarm` from the production Python manifest and promoted the
  pinned OpenAI Agents SDK profile (`openai-agents==0.21.1`) into the primary
  requirements file.
- Replaced the old adapter with an import-compatible, non-executable shim that
  preserves historical configuration/result shapes and raises a deterministic
  retirement error before any provider or credit call.
- Removed Agency Review/Creator/Feedback/Agencies FastAPI router registration,
  removed creator task auto-registration, and made the workflow node/listing
  fail closed.
- Removed public `/v1/agencies` registration and made the legacy tRPC toggle
  and mutation guard permanently reject reactivation. Historical schema and
  migration/export code remains read-only and recoverable.
- Added focused retirement tests and converted obsolete execution tests into
  explicit retired-path skips.
- Replaced the broad string scan with an active execution audit covering package
  imports, router registration, public registration, and feature-flag activation.

The remaining `agency_*` names in schema/history/UI are compatibility data and
do not represent an executable provider path. Deployment must still install the
updated requirements and run the focused regression suite before rollout.
