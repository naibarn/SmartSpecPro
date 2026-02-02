import React from "react";

interface MediaGenerationPanelProps {
  onGenerate?: (prompt: string) => void;
  isLoading?: boolean;
}

export function MediaGenerationPanel({
  onGenerate,
  isLoading = false
}: MediaGenerationPanelProps) {
  const [prompt, setPrompt] = React.useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && onGenerate) {
      onGenerate(prompt);
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h3 className="text-lg font-semibold mb-3">Media Generation</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the media you want to generate..."
          className="w-full p-2 border rounded-lg resize-none"
          rows={3}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Generating..." : "Generate"}
        </button>
      </form>
    </div>
  );
}
