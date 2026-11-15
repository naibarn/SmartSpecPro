# Component inventory

| Component / region | Purpose | Interaction |
|---|---|---|
| `MissionControlPrototypePage` | Isolated responsive route shell and local prototype state | View switching, filters, sorting, mode/theme, demo states |
| Fleet navigation | Overview, Harnesses, Agents, Runners, Active Work, Waiting / Attention, History, Mission Detail, Execution Inspector | Changes local projection only |
| Fleet filters | Demo project, Agent, Harness, Runner, status, sort | Filters six synthetic executions; reset restores defaults |
| Overview | At-a-glance synthetic counts, concurrent executions, attention decision | Select execution; preview decision |
| Inventory views | Harness, Agent, Runner rows including unavailable/offline examples | Select execution-associated item rows where represented |
| Mission detail | Mission identity and canonical-shaped Jobs, links, artifacts | Shows one completed and one active fixture Mission |
| Execution inspector | Overview and evidence navigation | Tabs for Overview, Activity / Events, Terminal, Files / Diff, Tests, Artifacts, Browser, Usage / Credits, Receipts, Verification |
| Event timeline | Ordered fixture events with synthetic cursor/time | Read-only; cursor stays labeled as fixture evidence |
| Evidence state | Honest unavailable evidence panel | No fake terminal, diff, browser, receipts, or verification output |
| Related navigation preview | Chat and Task Control links without real dispatch | Local preview and return to selected execution |
| Decision preview | Example user decision prompt | Expand/collapse explanatory copy only |
| Mobile navigation/inspector drawers | Small-screen access to secondary panes | Menu/Details buttons and close/backdrop actions |
| Theme and disclosure controls | Light, Dark, Balance; Simple, Developer | Uses the existing Astryx `Theme` provider for browser color mode plus scoped prototype theme variables and disclosure copy |
