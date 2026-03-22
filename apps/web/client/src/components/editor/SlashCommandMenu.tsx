import {
  useState,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  ImagePlus,
  FileUp,
  Video,
  Music2,
  Table,
} from "lucide-react";
import type { SlashCommandItem } from "./slashCommandItems";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  ImagePlus,
  FileUp,
  Video,
  Music2,
  Table,
};

export interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export interface SlashCommandMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const SlashCommandMenu = forwardRef<SlashCommandMenuRef, SlashCommandMenuProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index];
        if (item) command(item);
      },
      [items, command],
    );

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div
          className="rounded-md border border-border bg-popover p-2 shadow-md text-xs text-muted-foreground"
          data-testid="slash-menu"
        >
          No results
        </div>
      );
    }

    return (
      <div
        className="rounded-md border border-border bg-popover shadow-md overflow-y-auto max-h-80 min-w-48"
        data-testid="slash-menu"
      >
        {items.map((item, index) => {
          const Icon = ICON_MAP[item.icon];
          return (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors
                ${index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
              onClick={() => selectItem(index)}
              data-testid={`slash-item-${item.id}`}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  },
);

SlashCommandMenu.displayName = "SlashCommandMenu";

export default SlashCommandMenu;
