# Wave Contracts

## Contract 1: Presentation list data contract
- Source: trpc.library.listDocuments
- Request: scope=my_library, filters.itemType=presentation, sort=updated_desc
- Required fields: id, title, source, status, metadata, updated_at, created_at

## Contract 2: Editor open contract
- Input: selected presentation library item id
- Navigation target: /presentation-editor/:docId
- Guard behavior remains in PresentationEditor route via existing presentation.guardEditorOpen
