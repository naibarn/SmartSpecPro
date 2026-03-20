import CodeMirrorEditor from "@/components/library/CodeMirrorEditor";

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
  return (
    <div
      className="source-mode-panel flex-1"
      style={{ display: visible ? undefined : "none" }}
    >
      <CodeMirrorEditor
        value={value}
        onChange={onChange}
        fileExtension="md"
        height="100%"
        minHeight="300px"
      />
    </div>
  );
}

export { SourceModePanel };
export type { SourceModePanelProps };
