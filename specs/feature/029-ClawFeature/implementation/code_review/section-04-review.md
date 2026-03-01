# Section 04 Code Review: Canvas / AI Artifacts

## Critical Security Issues
1. postMessage wildcard target origin in ArtifactSandbox.tsx
2. sandbox.html responds with wildcard origin
3. Unvalidated HTML injection in sandbox.html (by design for sandbox)
4. localhost bypass in sandbox.html production code
5. createArtifactVersion lacks ownership validation
6. getArtifactVersions double-loads all artifacts

## Missing Features
7. parseArtifactBlocks/storeArtifacts never called in message flow
8. Artifact chips in ChatView missing
9. Nginx sandbox HTTP-only, needs HTTPS
10. MermaidRenderer unfiltered dangerouslySetInnerHTML
11. Feature flag not checked in updateArtifact
12. getArtifacts returns all versions, not latest per chain

## Code Quality
13. Pervasive any types
14. Missing UUID validation on artifactId
15. artifact.test.ts tests mock functions, not router
16. storeArtifacts JSONB race condition
17. Mermaid Date.now() ID flicker
18. X-Frame-Options ALLOWALL invalid
19. No error boundaries on renderers
20. TOCTOU flaw in tenant isolation
