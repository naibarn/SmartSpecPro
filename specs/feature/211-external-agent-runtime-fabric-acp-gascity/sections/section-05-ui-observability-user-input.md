# Section 05 — UI, Observability and User Input

Project real session/turn/activity/permission/background-task states into the
Spec 209 right inspector and bottom debug drawer. Preserve the approved
top-down-builder/run hierarchy; never add a new dashboard visual language.
Cover loading, empty, error, blocked, approval, selected/focus, responsive and
keyboard states. Display transport accepted versus effect completed and only
offer task stop controls supported by the provider.

## UI/UX Contract

### Target User / JTBD
Users monitor turns, approve permissions and understand supported controls.
### Surface Inventory
Mockup-aligned inspector plus output/data/trace/logs/artifacts/cost drawer.
### Component Map
Inspector session/config/permission; drawer activity/events/outputs/recovery.
### State Matrix
Loading, idle, prompting, permission, background, stop-supported, stop-unsupported, blocked, success and error.
### Responsive Matrix
Desktop panel/drawer, tablet sheet, mobile sequential stack.
### Accessibility Acceptance
Keyboard permission/stop, focus, labels, live status and reduced motion.
### Copy Contract
Never promise per-task stop when only session cancel is supported.
### Browser Evidence Required
Compare structure with Spec 209 mockups at three target viewports.
