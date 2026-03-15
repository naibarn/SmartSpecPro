# Plan Uplift

## Recommended Uplifts

### 1. Make Agency `browser_session` executable at runtime

- Severity: high
- Impact: high-impact
- Rationale: builder-only support leaves the main agency automation promise incomplete.
- Plan delta: add an Agency runtime execution path, session persistence, and structured run-to-chat Browser Session events.

### 2. Render the real browser stream in Browser Session Workspace

- Severity: high
- Impact: high-impact
- Rationale: login, captcha, checkout, and booking tasks require the user to see the real remote page state.
- Plan delta: add a viewport renderer that consumes viewer/controller stream tokens with reconnect handling.

### 3. Add conversation-native Browser Session launch flows

- Severity: high
- Impact: high-impact
- Rationale: toolbar-only entry is insufficient for the desired Chat and Agency automation UX.
- Plan delta: add assistant-proposed launch cards with explicit user confirmation and artifact persistence.

### 4. Normalize research and booking comparison outputs

- Severity: high
- Impact: high-impact
- Rationale: compare-heavy tasks break down when prices, distance, and evidence stay in free text.
- Plan delta: define reusable comparison contracts and rendering for research, ticket, and hotel flows.

### 5. Distinguish captcha and commitment barriers explicitly

- Severity: high
- Impact: high-impact
- Rationale: generic `Needs Your Input` is not enough for captcha, payment review, or booking confirmation safety.
- Plan delta: introduce explicit barrier types and mandatory human confirmation rules for irreversible actions.

### 6. Add advanced rollout scenario gates

- Severity: medium
- Impact: low-impact
- Rationale: the advanced automation layer should be canaried separately from the stable cross-surface baseline.
- Plan delta: add scenario-driven verification and rollout boundaries for the advanced slices.
