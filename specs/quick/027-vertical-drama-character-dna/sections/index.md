<!-- PROJECT_CONFIG
runtime: node-pnpm
test_command: pnpm --filter @smartspec/web test -- server/services/__tests__/verticalDramaCharacterVisualBible.skillContent.test.ts server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts server/services/__tests__/verticalDramaCharacterDesignContext.test.ts server/routers/__tests__/verticalDramaCharacters.characterDna.test.ts client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.characterDna.test.ts
target_dir: /home/dev/projects/SmartSpecPro
git_policy: no-stage-no-commit
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-skill-context-contracts
section-02-router-persistence
section-03-client-handoff-and-gates
END_MANIFEST -->

# Section Index

| Section | Depends on | Ownership |
|---|---|---|
| 01 Skill/context/contracts | none | skill files, shared DNA schema, context assembler, prompt runtime |
| 02 Router/persistence | 01 | Characters router and focused router tests |
| 03 Client/gates | 02 | Character stock panel, focused client test, integration evidence |

Execution is sequential. No section may stage or commit files.

