## Test-First Guidance

### Phase 1: Composite presets

Add tests that fail until:
- inserting a preset adds the expected set of primitive elements
- preset insertion keeps all generated elements within canvas bounds
- play/export renders inserted preset content without schema or renderer errors

### Phase 2: Grouping

Add tests that fail until:
- grouping selected elements serializes a stable group structure
- moving/resizing a group updates child layout predictably
- ungroup restores editable child elements without loss
- duplication and arrange-order commands work with groups

### Phase 3: Richer primitive

Add tests that fail until:
- new primitive validates in shared schema
- editor canvas and server render produce equivalent output
- property panel updates serialize correctly

## Regression Checks

- Existing slide content with only primitive elements continues to load unchanged.
- AI-generated slides that emit current primitives remain valid.
- Export routes do not silently drop unknown element types.
