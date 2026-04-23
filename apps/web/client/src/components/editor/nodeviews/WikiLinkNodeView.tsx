import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import KnowledgeNoteHoverPreview from "@/components/library/KnowledgeNoteHoverPreview";

export default function WikiLinkNodeView({ node, editor }: NodeViewProps) {
  const reference = String(node.attrs.reference ?? "");
  const label = String(node.attrs.label ?? reference);

  return (
    <KnowledgeNoteHoverPreview reference={reference} label={label}>
      <span className="inline-flex">
        <NodeViewWrapper
          as="span"
          className="wiki-link-chip"
          data-wikilink="true"
          data-reference={reference}
          data-label={label}
          data-node-type="wiki-link"
          contentEditable={false}
          role="link"
          tabIndex={0}
          aria-label={`Open linked note ${label}`}
          title={
            reference && reference !== label
              ? `${label} (${reference})`
              : label
          }
          data-editable={editor.isEditable ? "true" : "false"}
        >
          {label}
        </NodeViewWrapper>
      </span>
    </KnowledgeNoteHoverPreview>
  );
}

export { WikiLinkNodeView };
