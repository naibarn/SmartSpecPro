# UI interaction gap audit — current Spec 209 implementation

This audit compares the requested editor behavior with the current
`WorkflowStudioPage.tsx`. The current page is a mockup/state-proof shell, not a
complete editor.

| Requested behavior | Current evidence | Conclusion |
|---|---|---|
| Move nodes | Nodes are rendered as buttons inside an ordered HTML list; no graph library, drag handlers or persisted position state | GAP |
| Clear, attractive edges | Connections are `border-dashed` spans and a rotated diamond; no edge model, handles, arrow markers or selection | GAP |
| Node Properties | Selected node label is read-only; settings only says server-authoritative; no per-kind editable form | GAP |
| Library/Marketplace open | Search is disabled and card Open is disabled | GAP |
| Builder tabs | Build is the only enabled tab; Test/Runs/Analytics/Versions are disabled | GAP |
| Publish | Button calls `showSetupNotice`, not `publishVersion` | GAP |
| Improve with AI | Button calls `showSetupNotice`, not an AI mutation | GAP |
| Run | Navigation reaches the Run surface, but submit only validates local input then shows runtime unavailable | PARTIAL / fail-closed |
| Debug drawer | Tabs switch local placeholder text; no result/trace/log/artifact query | GAP |
| Draft persistence | Builder state is local React state; no save/update draft mutation is wired | GAP |

## Required plan correction

Section 07 now includes a mandatory Editor Interaction Contract covering
`@xyflow/react`, node/edge graph state, Properties forms, draft persistence,
all CTA command mappings, interaction acceptance, TDD and browser evidence.
The supplied mockup remains the layout source; the correction adds behavior and
does not authorize inventing a new screen.
