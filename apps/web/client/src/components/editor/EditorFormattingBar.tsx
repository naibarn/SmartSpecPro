import { useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  FileUp,
  Italic,
  Link as LinkIcon,
  Link2,
  List,
  ListOrdered,
  Minus,
  Music2,
  MoreHorizontal,
  Quote,
  Redo2,
  Table,
  Underline as UnderlineIcon,
  Undo2,
  Video,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EditorFormattingBarProps {
  editor: Editor | null;
  onInsertLink: () => void;
  onInsertMedia?: (type: "image" | "video" | "audio") => void;
  onInsertFile?: () => void;
  compact?: boolean;
  className?: string;
  collapseOnMobile?: boolean;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  "aria-label": string;
  children: ReactNode;
  compact?: boolean;
  testId?: string;
}

function ToolbarButton({
  onClick,
  active,
  disabled,
  title,
  "aria-label": ariaLabel,
  children,
  compact,
  testId,
}: ToolbarButtonProps) {
  const sizeClasses = compact ? "h-8 w-8" : "h-9 w-9";

  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`${sizeClasses} shrink-0`}
    >
      {children}
    </Button>
  );
}

function Divider({ compact }: { compact?: boolean }) {
  return (
    <div
      className={`self-stretch border-r border-border/70 ${compact ? "mx-0.5" : "mx-1"}`}
      aria-hidden="true"
    />
  );
}

interface ToolbarAction {
  id: string;
  label: string;
  title: string;
  ariaLabel: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  testId?: string;
  tooltip?: string;
}

type MobileMoreTab = "formatting" | "insert";

function MenuActionButton({
  action,
  onSelect,
}: {
  action: ToolbarAction;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant={action.active ? "default" : "ghost"}
      onClick={() => {
        try {
          action.onClick();
        } finally {
          onSelect();
        }
      }}
      disabled={action.disabled}
      title={action.title}
      aria-label={action.ariaLabel}
      className="h-auto w-full justify-start gap-2 px-2 py-2 text-sm"
    >
      {action.icon}
      <span>{action.label}</span>
    </Button>
  );
}

export default function EditorFormattingBar({
  editor,
  onInsertLink,
  onInsertMedia,
  onInsertFile,
  compact,
  className,
  collapseOnMobile,
}: EditorFormattingBarProps) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileMoreTab, setMobileMoreTab] =
    useState<MobileMoreTab>("formatting");
  const iconSize = "h-4 w-4";

  const canUndo = editor?.can().chain().focus().undo().run() ?? false;
  const canRedo = editor?.can().chain().focus().redo().run() ?? false;

  const paragraphAction: ToolbarAction = {
    id: "paragraph",
    label: "Normal",
    title: "Normal text",
    ariaLabel: "Normal text",
    icon: <span className="text-[11px] font-semibold tracking-tight">Aa</span>,
    onClick: () => editor?.chain().focus().setParagraph().run(),
    active: editor?.isActive("paragraph") ?? false,
    disabled: !editor,
    testId: "toolbar-normal-text",
  };

  const headingActions = ([1, 2, 3, 4] as const).map((level) => {
    const Icon = [Heading1, Heading2, Heading3, Heading4][level - 1];
    return {
      id: `heading-${level}`,
      label: `Heading ${level}`,
      title: `Heading ${level}`,
      ariaLabel: `Heading ${level}`,
      icon: <Icon className={iconSize} />,
      onClick: () => editor?.chain().focus().toggleHeading({ level }).run(),
      active: editor?.isActive("heading", { level }) ?? false,
      disabled: !editor,
    } satisfies ToolbarAction;
  });

  const commonActions: ToolbarAction[] = [
    {
      id: "undo",
      label: "Undo",
      title: "Undo (Ctrl+Z)",
      ariaLabel: "Undo",
      icon: <Undo2 className={iconSize} />,
      onClick: () => editor?.chain().focus().undo().run(),
      disabled: !editor || !canUndo,
    },
    {
      id: "redo",
      label: "Redo",
      title: "Redo (Ctrl+Shift+Z)",
      ariaLabel: "Redo",
      icon: <Redo2 className={iconSize} />,
      onClick: () => editor?.chain().focus().redo().run(),
      disabled: !editor || !canRedo,
    },
  ];

  const inlineActions: ToolbarAction[] = [
    {
      id: "bold",
      label: "Bold",
      title: "Bold (Ctrl+B)",
      ariaLabel: "Bold",
      icon: <Bold className={iconSize} />,
      onClick: () => editor?.chain().focus().toggleBold().run(),
      active: editor?.isActive("bold") ?? false,
      disabled: !editor,
    },
    {
      id: "italic",
      label: "Italic",
      title: "Italic (Ctrl+I)",
      ariaLabel: "Italic",
      icon: <Italic className={iconSize} />,
      onClick: () => editor?.chain().focus().toggleItalic().run(),
      active: editor?.isActive("italic") ?? false,
      disabled: !editor,
    },
    {
      id: "underline",
      label: "Underline",
      title: "Underline (Ctrl+U)",
      ariaLabel: "Underline",
      icon: <UnderlineIcon className={iconSize} />,
      onClick: () => editor?.chain().focus().toggleUnderline().run(),
      active: editor?.isActive("underline") ?? false,
      disabled: !editor,
    },
    {
      id: "inline-code",
      label: "Inline Code",
      title: "Inline Code",
      ariaLabel: "Inline Code",
      icon: <Code className={iconSize} />,
      onClick: () => editor?.chain().focus().toggleCode().run(),
      active: editor?.isActive("code") ?? false,
      disabled: !editor,
    },
    {
      id: "link",
      label: "Link",
      title: "Link",
      ariaLabel: "Link",
      icon: <LinkIcon className={iconSize} />,
      onClick: onInsertLink,
      disabled: !editor,
    },
    {
      id: "knowledge-link",
      label: "Knowledge Link",
      title: "Knowledge Link ([[...]])",
      ariaLabel: "Knowledge Link",
      icon: <Link2 className={iconSize} />,
      onClick: () => editor?.chain().focus().insertContent("[[").run(),
      disabled: !editor,
      tooltip: "Insert a knowledge vault note link",
      testId: "toolbar-knowledge-link",
    },
  ];

  const blockActions: ToolbarAction[] = [
    {
      id: "bullet-list",
      label: "Bullet List",
      title: "Bullet List",
      ariaLabel: "Bullet List",
      icon: <List className={iconSize} />,
      onClick: () => editor?.chain().focus().toggleBulletList().run(),
      active: editor?.isActive("bulletList") ?? false,
      disabled: !editor,
    },
    {
      id: "ordered-list",
      label: "Ordered List",
      title: "Ordered List",
      ariaLabel: "Ordered List",
      icon: <ListOrdered className={iconSize} />,
      onClick: () => editor?.chain().focus().toggleOrderedList().run(),
      active: editor?.isActive("orderedList") ?? false,
      disabled: !editor,
    },
    {
      id: "blockquote",
      label: "Blockquote",
      title: "Blockquote",
      ariaLabel: "Blockquote",
      icon: <Quote className={iconSize} />,
      onClick: () => editor?.chain().focus().toggleBlockquote().run(),
      active: editor?.isActive("blockquote") ?? false,
      disabled: !editor,
    },
    {
      id: "code-block",
      label: "Code Block",
      title: "Code Block",
      ariaLabel: "Code Block",
      icon: <Code2 className={iconSize} />,
      onClick: () => editor?.chain().focus().toggleCodeBlock().run(),
      active: editor?.isActive("codeBlock") ?? false,
      disabled: !editor,
    },
    {
      id: "horizontal-rule",
      label: "Horizontal Rule",
      title: "Horizontal Rule",
      ariaLabel: "Horizontal Rule",
      icon: <Minus className={iconSize} />,
      onClick: () => editor?.chain().focus().setHorizontalRule().run(),
      active: editor?.isActive("horizontalRule") ?? false,
      disabled: !editor,
    },
  ];

  const tableAction: ToolbarAction = {
    id: "table",
    label: "Table",
    title: "Insert Table",
    ariaLabel: "Insert Table",
    icon: <Table className={iconSize} />,
    onClick: () =>
      editor
        ?.chain()
        .focus()
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
    active: editor?.isActive("table") ?? false,
    disabled: !editor,
    testId: "toolbar-insert-table",
  };

  const tableEditingActions: ToolbarAction[] = [
    {
      id: "table-row-above",
      label: "Row Above",
      title: "Insert Row Above",
      ariaLabel: "Insert Row Above",
      icon: <span className="text-[11px] font-semibold">↑R</span>,
      onClick: () => editor?.chain().focus().addRowBefore().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-row-above",
    },
    {
      id: "table-row-below",
      label: "Row Below",
      title: "Insert Row Below",
      ariaLabel: "Insert Row Below",
      icon: <span className="text-[11px] font-semibold">↓R</span>,
      onClick: () => editor?.chain().focus().addRowAfter().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-row-below",
    },
    {
      id: "table-col-left",
      label: "Column Left",
      title: "Insert Column Left",
      ariaLabel: "Insert Column Left",
      icon: <span className="text-[11px] font-semibold">←C</span>,
      onClick: () => editor?.chain().focus().addColumnBefore().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-col-left",
    },
    {
      id: "table-col-right",
      label: "Column Right",
      title: "Insert Column Right",
      ariaLabel: "Insert Column Right",
      icon: <span className="text-[11px] font-semibold">→C</span>,
      onClick: () => editor?.chain().focus().addColumnAfter().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-col-right",
    },
    {
      id: "table-delete-row",
      label: "Delete Row",
      title: "Delete Row",
      ariaLabel: "Delete Row",
      icon: <span className="text-[11px] font-semibold">✕R</span>,
      onClick: () => editor?.chain().focus().deleteRow().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-delete-row",
    },
    {
      id: "table-delete-column",
      label: "Delete Column",
      title: "Delete Column",
      ariaLabel: "Delete Column",
      icon: <span className="text-[11px] font-semibold">✕C</span>,
      onClick: () => editor?.chain().focus().deleteColumn().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-delete-column",
    },
    {
      id: "table-delete-table",
      label: "Delete Table",
      title: "Delete Table",
      ariaLabel: "Delete Table",
      icon: <span className="text-[11px] font-semibold">✕T</span>,
      onClick: () => editor?.chain().focus().deleteTable().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-delete-table",
    },
  ];

  const tableStructureActions: ToolbarAction[] = [
    {
      id: "table-merge-cells",
      label: "Merge Cells",
      title: "Merge Cells",
      ariaLabel: "Merge Cells",
      icon: <span className="text-[11px] font-semibold">⤫</span>,
      onClick: () => editor?.chain().focus().mergeCells().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-merge-cells",
    },
    {
      id: "table-split-cell",
      label: "Split Cell",
      title: "Split Cell",
      ariaLabel: "Split Cell",
      icon: <span className="text-[11px] font-semibold">↔</span>,
      onClick: () => editor?.chain().focus().splitCell().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-split-cell",
    },
    {
      id: "table-header-row",
      label: "Header Row",
      title: "Toggle Header Row",
      ariaLabel: "Toggle Header Row",
      icon: <span className="text-[11px] font-semibold">HR</span>,
      onClick: () => editor?.chain().focus().toggleHeaderRow().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-header-row",
    },
    {
      id: "table-header-column",
      label: "Header Column",
      title: "Toggle Header Column",
      ariaLabel: "Toggle Header Column",
      icon: <span className="text-[11px] font-semibold">HC</span>,
      onClick: () => editor?.chain().focus().toggleHeaderColumn().run(),
      disabled: !editor || !(editor?.isActive("table") ?? false),
      testId: "toolbar-table-header-column",
    },
  ];

  const mediaActions: ToolbarAction[] = onInsertMedia
    ? [
        {
          id: "insert-image",
          label: "Insert Image",
          title: "Insert Image",
          ariaLabel: "Insert Image",
          tooltip: "Insert an image",
          icon: <ImagePlus className={iconSize} />,
          onClick: () => onInsertMedia("image"),
          disabled: !editor,
        },
        {
          id: "insert-video",
          label: "Insert Video",
          title: "Insert Video",
          ariaLabel: "Insert Video",
          tooltip: "Insert a video",
          icon: <Video className={iconSize} />,
          onClick: () => onInsertMedia("video"),
          disabled: !editor,
        },
        {
          id: "insert-audio",
          label: "Insert Audio",
          title: "Insert Audio",
          ariaLabel: "Insert Audio",
          tooltip: "Insert audio",
          icon: <Music2 className={iconSize} />,
          onClick: () => onInsertMedia("audio"),
          disabled: !editor,
        },
      ]
    : [];

  if (onInsertFile) {
    mediaActions.push({
      id: "insert-file",
      label: "Insert File",
      title: "Insert File",
      ariaLabel: "Insert File",
      tooltip: "Attach a file",
      icon: <FileUp className={iconSize} />,
      onClick: onInsertFile,
      disabled: !editor,
    });
  }

  const renderIconButton = (action: ToolbarAction) => (
    <Tooltip key={action.id} delayDuration={250}>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <ToolbarButton
            onClick={action.onClick}
            active={action.active}
            disabled={action.disabled}
            title={action.title}
            aria-label={action.ariaLabel}
            compact={compact}
            testId={action.testId}
          >
            {action.icon}
          </ToolbarButton>
        </span>
      </TooltipTrigger>
      <TooltipContent>{action.tooltip ?? action.title}</TooltipContent>
    </Tooltip>
  );

  const renderMenuSection = (label: string, actions: ToolbarAction[]) =>
    actions.length > 0 ? (
      <div className="space-y-1">
        <div className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="grid grid-cols-1 gap-1">
          {actions.map((action) => (
            <MenuActionButton
              key={action.id}
              action={action}
              onSelect={() => setMobileMoreOpen(false)}
            />
          ))}
        </div>
      </div>
    ) : null;

  const desktopToolbar = (
    <div
      className={`${collapseOnMobile ? "hidden sm:flex" : "flex"} flex-nowrap items-center gap-1 overflow-x-auto pb-1 pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
      role="group"
      aria-label="Formatting toolbar"
    >
      {commonActions.map(renderIconButton)}
      <Divider compact={compact} />
      {renderIconButton(paragraphAction)}
      {headingActions.map(renderIconButton)}
      {inlineActions.map(renderIconButton)}
      <Divider compact={compact} />
      {blockActions.map(renderIconButton)}
      <Divider compact={compact} />
      {renderIconButton(tableAction)}
      <Divider compact={compact} />
      {tableEditingActions.map(renderIconButton)}
      <Divider compact={compact} />
      {tableStructureActions.map(renderIconButton)}
      {mediaActions.length > 0 ? (
        <>
          <Divider compact={compact} />
          {mediaActions.map(renderIconButton)}
        </>
      ) : null}
    </div>
  );

  if (!collapseOnMobile) {
    return desktopToolbar;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div className={`${className ?? ""}`}>
        <div
          className="flex items-center gap-1 overflow-x-auto pb-1 pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:hidden"
          role="group"
          aria-label="Formatting toolbar"
        >
          {commonActions.map(renderIconButton)}
          <Popover open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={`${compact ? "h-8 w-8" : "h-9 w-9"} shrink-0`}
                title="More tools"
                aria-label="More tools"
              >
                <MoreHorizontal className={iconSize} />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[min(18rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] p-2"
              align="start"
              sideOffset={8}
            >
              <div className="max-h-[70vh] space-y-3 overflow-y-auto">
                <div
                  role="tablist"
                  aria-label="More tools sections"
                  className="grid w-full grid-cols-2 rounded-lg bg-muted/40 p-1"
                >
                  {(
                    [
                      ["formatting", "Formatting"],
                      ["insert", "Insert"],
                    ] as const
                  ).map(([value, label]) => {
                    const active = mobileMoreTab === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setMobileMoreTab(value)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {mobileMoreTab === "formatting" ? (
                  <div className="space-y-3">
                    {renderMenuSection("Text", [
                      paragraphAction,
                      headingActions[0],
                      headingActions[1],
                      headingActions[2],
                      headingActions[3],
                      inlineActions[0],
                      inlineActions[1],
                      inlineActions[2],
                      inlineActions[3],
                      inlineActions[5],
                    ])}
                    {renderMenuSection("Blocks", [
                      blockActions[0],
                      blockActions[1],
                      blockActions[2],
                      blockActions[3],
                      blockActions[4],
                    ])}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {renderMenuSection("Table", [
                      tableAction,
                      ...tableEditingActions,
                      ...tableStructureActions,
                    ])}
                    {renderMenuSection("Insert", [
                      inlineActions[4],
                      inlineActions[5],
                      ...mediaActions,
                    ])}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {desktopToolbar}
      </div>
    </TooltipProvider>
  );
}

export { EditorFormattingBar };
export type { EditorFormattingBarProps };
