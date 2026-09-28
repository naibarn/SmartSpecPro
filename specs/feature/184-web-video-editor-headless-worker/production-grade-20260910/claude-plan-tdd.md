# TDD and proof plan

Write contract and claim-matching tests before enabling each Worker operation. Add Rust executor fixtures and TypeScript router tests, then run bounded esbuild and focused Vitest/Cargo tests. Use real staging only for R2, Redis restart, Worker claim, microphone, GPU and provider/adapter evidence. Do not run repository-wide npm typecheck.
