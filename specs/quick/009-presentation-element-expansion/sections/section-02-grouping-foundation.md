## Goal

Make composite blocks editable as one logical object instead of loose primitives.

## Scope

- Introduce persistent grouping or component-instance support.
- Support:
  - group
  - ungroup
  - move as one
  - duplicate as one
  - basic resize behavior

## Main Design Requirement

The group model should preserve compatibility with existing slide content and should not require immediate migration of all current primitives.

## Done When

- A block inserted from presets can be manipulated as one object.
- Group operations behave consistently in editor commands and serialization.
