# Request

Add a general Help entry for the Chat page that explains:
- everyday chat usage
- skills and slash commands
- image/video generation entry points
- memory usage
- Browser Session relationship
- Agency Swarm relationship

If Chat does not already integrate directly with Agency Swarm, document and plan the next development step.

# Repository Assumptions

- Chat already has Browser Session help, but not a broader Chat help surface.
- Agencies / Agency Swarm already exist as a dedicated product surface under `/agencies/*`.
- Chat currently exposes Generate, Skills, Memory, and Browser Session controls in the page chrome.

# Non-goals

- Implementing full Chat-to-Agency Swarm execution handoff in this change.
- Reworking Agency runtime behavior.
