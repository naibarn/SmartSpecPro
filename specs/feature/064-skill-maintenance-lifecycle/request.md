# Request Summary

Create a complete skill maintenance lifecycle for SmartSpecPro that:

1. analyzes a selected skill from Admin > Skills and recommends improvements or upgrades
2. protects existing input/output contracts so upstream callers do not break
3. lets admins review advice and explicitly confirm whether to apply changes
4. supports scheduled sweeps over all skills and stores per-skill recommendations for later review
5. can recommend and execute safe `migrate-to-genjs` upgrades when a skill is a strong JavaScript/Node.js/JSON-heavy candidate
6. provisions the required bundle files, tools, package/runtime checks, and fixture tests for GenJS bundle skills
7. allows admins to configure downstream handoff / swarm orchestration in the skill editor
8. uses a real loop: analyze -> recommend -> preview -> approve -> apply -> verify -> audit

This feature must build on the current Admin Skills UI, skill router/service layer, skill studio/ISC proposal workflow, sandbox-command execution, and current scheduler patterns.
