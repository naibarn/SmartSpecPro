# section-01-isolated-route-and-fleet-shell

- requirement_ids: REQ-294-UW2-01, REQ-294-UW2-04, REQ-294-OWNER-UX-02, REQ-294-OWNER-UX-04, SPEC-277 responsive/progressive-disclosure baseline
- objective: Add authenticated DEV-only path `/dev/mission-control-prototype` with strict hostname guard and a full-page synthetic Mission Control shell. Include Overview, Harnesses, Agents, Runners, Active Work, Waiting / Attention, History, Mission Detail, Execution Inspector, project/workspace and execution filters, sort, selectable execution identities, Simple/Developer and Light/Dark/Balance controls, local scenario states, clear synthetic-data banner, and responsive accessible layout.
- owned paths: `smartaihub-platform/apps/saas-shell/src/App.tsx`; new `pages/MissionControlPrototypePage.tsx`; new `pages/missionControlPrototype.css`; fixture file under `apps/saas-shell/src/fixtures/`; matching page test.
- prerequisites: current shell source read; canonical DTO definitions identified; `mission.md` boundaries.
- completion predicate: local state only; no backend requests; no changes to `/chat` behavior; all view navigation/filter/theme/mode/scenario controls respond; host guard denies non-dev host; tablet/mobile use one-column/on-demand secondary panels.
- verification: focused shell Vitest route and component coverage; inspect request spy remains unused; shell build.
- expected evidence: focused test output and source SHA in task handoff.
- fallback/substitution: Keep unavailable route states truthful; if Astryx layout primitive cannot support a specific panel, use existing semantic HTML/CSS conventions without new dependency.
- blocker challenge: Do not introduce a backend endpoint or broaden application routing to solve fixture presentation.
- waiting/reactivation: None; continue with fallback if browser automation is unavailable, but record screenshots as pending rather than claiming them.
