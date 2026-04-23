import { useMemo } from "react";
import { Braces, Hash, Layers3, Sparkles, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import CodeMirrorEditor from "@/components/library/CodeMirrorEditor";
import { trpc } from "@/lib/trpc";
import {
  ensureFrontmatterAliases,
  ensureFrontmatterProperty,
  ensureFrontmatterTags,
  ensureKnowledgeFrontmatter,
} from "@/lib/frontmatterHelpers";
import { createSourceModeAutocompleteExtension } from "./sourceModeAutocomplete";

interface SourceModePanelProps {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
}

export default function SourceModePanel({
  value,
  onChange,
  visible,
}: SourceModePanelProps) {
  const tagCatalogQuery = trpc.library.listTagCatalog.useQuery(
    { query: undefined },
    {
      enabled: visible,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    }
  );
  const propertyCatalogQuery = trpc.library.listPropertyCatalog.useQuery(
    { query: undefined },
    {
      enabled: visible,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    }
  );
  const quickSwitchQuery = trpc.library.quickSwitchNotes.useQuery(
    { query: undefined, limit: 16 },
    {
      enabled: visible,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    }
  );
  const sourceModeExtensions = useMemo(
    () => [
      createSourceModeAutocompleteExtension({
        tags: (tagCatalogQuery.data?.tags ?? []).map(entry => entry.tag),
        propertyKeys: (propertyCatalogQuery.data?.properties ?? []).map(
          entry => entry.key
        ),
        aliases: (quickSwitchQuery.data?.results ?? []).flatMap(entry => [
          entry.title,
          ...(entry.aliases ?? []),
        ]),
      }),
    ],
    [
      propertyCatalogQuery.data?.properties,
      quickSwitchQuery.data?.results,
      tagCatalogQuery.data?.tags,
    ]
  );

  return (
    <div
      className="source-mode-panel flex h-full min-h-0 flex-col"
      style={{ display: visible ? undefined : "none" }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2">
        <div className="mr-2 flex items-center gap-2 text-xs text-slate-600">
          <Sparkles className="h-3.5 w-3.5 text-sky-600" />
          Frontmatter helpers
        </div>
        <div className="text-xs text-slate-500">
          Autocomplete supports keys, aliases, and tags inside the YAML block.
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full"
          onClick={() => onChange(ensureKnowledgeFrontmatter(value))}
        >
          <Layers3 className="mr-2 h-3.5 w-3.5" />
          Insert frontmatter
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full"
          onClick={() => onChange(ensureFrontmatterAliases(value))}
        >
          <Tag className="mr-2 h-3.5 w-3.5" />
          Aliases
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full"
          onClick={() => onChange(ensureFrontmatterTags(value))}
        >
          <Hash className="mr-2 h-3.5 w-3.5" />
          Tags
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-full"
          onClick={() => onChange(ensureFrontmatterProperty(value))}
        >
          <Braces className="mr-2 h-3.5 w-3.5" />
          Property
        </Button>
      </div>
      <CodeMirrorEditor
        value={value}
        onChange={onChange}
        fileExtension="md"
        extensions={sourceModeExtensions}
        height="100%"
        minHeight="300px"
      />
    </div>
  );
}

export { SourceModePanel };
export type { SourceModePanelProps };
