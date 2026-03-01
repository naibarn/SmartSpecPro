import { SafeMarkdown } from "@/components/chat/SafeMarkdown";

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none p-4">
      <SafeMarkdown>{content}</SafeMarkdown>
    </div>
  );
}
