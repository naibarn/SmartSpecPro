# Agent Experience Performance Baseline

Status: baseline required before live preview.

| Area | Current status | Required before live preview |
|---|---|---|
| Adapter parse overhead | package tests only | p95 baseline against fixture batches |
| Timeline append/update | fixture-only component tests | browser/component baseline |
| Time to first token/event | not measured | compare with existing surface |
| Shadow mode overhead | not enabled | measure or sample before rollout |
| Artifact preview load | pointer-only | lazy-load evidence before live preview |
| Debug inspector expansion | redacted helper only | measure expansion when UI is added |
| External renderer bundle impact | dependency not installed | dependency gate report |
