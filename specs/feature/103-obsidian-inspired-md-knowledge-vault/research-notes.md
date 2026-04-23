# Research Notes

## Repo scan

- The current Library / Document Management surface already exists in:
  - `apps/web/client/src/pages/DocumentManagement.tsx`
  - `apps/web/client/src/components/library/`
  - `apps/web/client/src/lib/documentManagementUi.ts`
  - `apps/web/server/routers/library.ts`
  - `apps/web/server/services/libraryService.ts`
- The current library model already has useful primitives for a knowledge layer:
  - `library_items`
  - `library_chunks`
  - `library_content_versions`
  - `library_permissions`
  - `allowedScopes`
  - markdown save / reindex flows
- The menu already routes users to `/document-management`, so this is a continuation of the existing product surface rather than a new app.
- The workspace already includes interaction libraries that fit the desired access model:
  - `cmdk` and `fuse.js` for quick switcher / fuzzy lookup
  - `reactflow` and `@xyflow/react` for graph or canvas surfaces
  - `tiptap` for note-centric editing

## Obsidian concepts that matter here

- Vaults are plain Markdown files on disk, which makes files portable and editable outside the app.
- Obsidian keeps a local metadata cache so relationships and navigation remain fast.
- Backlinks and outgoing links expose note relationships, including unlinked mentions.
- Graph view is about visualizing relationships, not just showing search hits.
- Properties view turns frontmatter / properties into a first-class management surface.
- Bases shows that files can be queried like a lightweight database and rendered in multiple layouts.
- Canvas shows that synthesis often needs a spatial workspace, not only a list or search bar.
- Quick switcher proves that keyboard-first note opening is a core access path, not a nice-to-have.

## Official sources used

- Vault and local file model: https://help.obsidian.md/data-storage
- Backlinks and unlinked mentions: https://help.obsidian.md/plugins/backlinks
- Search operators and property search: https://help.obsidian.md/plugins/search
- Graph view and local graph: https://help.obsidian.md/plugins/graph
- Properties view: https://help.obsidian.md/plugins/properties
- Bases: https://help.obsidian.md/bases
- Canvas: https://help.obsidian.md/Plugins/Canvas
- Quick switcher: https://help.obsidian.md/plugins/quick-switcher
- File explorer behavior: https://help.obsidian.md/Plugins/File%20explorer

## Product takeaways

- File search is necessary but not sufficient.
- The product should expose note relationships, note properties, and saved views as first-class navigation.
- Markdown should be treated as the knowledge substrate, while other file types remain supporting evidence or attachments.
- All derived knowledge views must still obey tenant, project, and permission boundaries.
