# Section 02

## Goal
Make relayout choose built-in blocks before any internal plain-template fallback.

## Tasks
- pass canvas dimensions into relayout recipe scoring
- add legacy template -> block fallback mapping
- update fallback warnings/copy
- update relayout tests that currently expect `componentRecipeId` to stay undefined
