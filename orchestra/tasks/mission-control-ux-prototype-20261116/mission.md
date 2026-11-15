# SmartSIHub Mission Control interactive UX prototype

## Source authority

- SPEC-294 §§61–65, especially §§61.5 and 62–65
- SPEC-277 canonical Task Control Experience R1.8
- SPEC-312 Chat Shell R1.24
- SmartAIHub Platform assistant-ui and Astryx design system
- Owner supplied Mission Control and Task Control mockups in the originating request

## Objective

Build an interactive, responsive, DEV-only Mission Control concept route in the Modular SaaS platform. Do not replace existing Chat, Task Control, Mission Control, or API behavior. Use synthetic fixtures visibly labeled as demo data; do not mutate backend state or introduce schemas, schedulers, queues, contracts, migrations, or production routes.

## Required workspace

Provide Overview, Harnesses, Agents, Runners, Active Work, Waiting / Attention, History, Mission Detail, and Execution Inspector. Include Simple and Developer modes and Light, Dark, and Balance themes. Layout must be full-page and not modal-first. On desktop show fleet navigation, work list and execution inspector; on tablet/mobile use accessible navigation and on-demand drawers with the selected execution remaining usable.

## Interactions

- Select workspace/project and Agent/Harness/Runner
- Filter and sort synthetic executions
- Select/switch concurrent execution tabs and restore selected execution from URL
- Switch detail tabs, open mission details, events and artifacts
- Reveal pending user decisions and navigate to related Chat or Task Control demo routes
- Return to a represented existing session
- Exercise loading, error, empty, offline, failed, and unavailable states
- All interactions operate locally without backend requests or successful-looking mutations

## Fixture rules

Use existing canonical DTOs where they apply, especially `smartaihub.tenant-mission.v1`, task-control projection and execution event envelope. Clearly mark fixtures as synthetic. Include simultaneous working, waiting, and failed executions, offline Runner, unavailable Harness, multi-Job Mission, completed Mission with artifacts, and an execution whose Agent and Run identities are null. Never fill missing identities with fixture display IDs. Unsupported terminal, diff, browser, usage/credit, receipt, or verification evidence must say unavailable in this prototype.

## Delivery and evidence

- Keep route isolated and available only on modular-debian-dev and local development; preserve current live routes.
- Verify 1440x900, 820x1180, and 390x844; capture screenshots.
- Produce interaction-flow documentation, component inventory, SPEC-294 mapping, existing implementation gap matrix, and proposal for integrating approved UI with the existing Mission runtime.
- Prototype checks do not close SPEC-312, SPEC-224, or authenticated owner UAT.
