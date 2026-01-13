// CLI Interface Component
// Main OpenCode CLI UI with command input and output

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  useCli, 
  OutputBlock, 
  CodeSuggestion,
  getOutputBlockIcon,
  getDiffLineClass,
} from '../../services/cliService';

interface CliInterfaceProps {
  className?: string;
}

export function CliInterface({ className = '' }: CliInterfaceProps) {
  const {
    executeCliCommand,
    isExecuting,
    lastResult,
    navigateHistory,
    suggestions,
    handleAccept,
    handleReject,
    handleModify,
  } = useCli();

  const [input, setInput] = useState('');
  const [outputs, setOutputs] = useState<OutputBlock[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputs, suggestions]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Update outputs when result changes
  useEffect(() => {
    if (lastResult) {
      setOutputs(prev => [...prev, ...lastResult.output]);
    }
  }, [lastResult]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isExecuting) return;

    const command = input;
    setInput('');

    // Add command to output
    setOutputs(prev => [...prev, {
      block_type: 'Text',
      content: `> ${command}`,
      metadata: { type: 'command' },
    }]);

    await executeCliCommand(command);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = navigateHistory('up');
      if (prev) setInput(prev);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = navigateHistory('down');
      setInput(next || '');
    }
  };

  const handleClear = () => {
    setOutputs([]);
  };

  return (
    <div className={`flex flex-col h-full bg-gray-900 text-gray-100 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-green-400 font-mono text-sm">⚡</span>
          <span className="font-semibold">OpenCode CLI</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded"
          >
            Clear
          </button>
          <span className="text-xs text-gray-500">
            {isExecuting ? '⏳ Processing...' : '✓ Ready'}
          </span>
        </div>
      </div>

      {/* Output Area */}
      <div 
        ref={outputRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-sm space-y-2"
      >
        {/* Welcome Message */}
        {outputs.length === 0 && (
          <WelcomeMessage />
        )}

        {/* Output Blocks */}
        {outputs.map((block, i) => (
          <OutputBlockComponent key={i} block={block} />
        ))}

        {/* Pending Suggestions */}
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            onAccept={() => handleAccept(suggestion.id)}
            onReject={() => handleReject(suggestion.id)}
            onModify={(content) => handleModify(suggestion.id, content)}
          />
        ))}

        {/* Loading Indicator */}
        {isExecuting && (
          <div className="flex items-center gap-2 text-gray-400">
            <span className="animate-pulse">⏳</span>
            <span>Processing...</span>
          </div>
        )}
      </div>

      {/* Command Buttons */}
      <div className="px-4 py-2 border-t border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {['/spec', '/plan', '/tasks', '/implement', '/debug', '/review', '/help'].map((cmd) => (
            <button
              key={cmd}
              onClick={() => setInput(cmd + ' ')}
              className="px-3 py-1 text-xs font-medium bg-gray-700 hover:bg-gray-600 rounded whitespace-nowrap"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="px-4 py-3 bg-gray-800 border-t border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-green-400">❯</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or question..."
            disabled={isExecuting}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-gray-500"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={!input.trim() || isExecuting}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded text-sm"
          >
            Run
          </button>
        </div>
      </form>
    </div>
  );
}

// Welcome Message Component
function WelcomeMessage() {
  return (
    <div className="text-gray-400 space-y-2">
      <div className="text-green-400 font-bold">
        ╔═══════════════════════════════════════════════╗
        <br />
        ║     Welcome to SmartSpecPro OpenCode CLI      ║
        <br />
        ╚═══════════════════════════════════════════════╝
      </div>
      <div className="mt-4">
        <p>Available commands:</p>
        <ul className="ml-4 mt-2 space-y-1">
          <li><span className="text-yellow-400">/spec</span> - Create specifications</li>
          <li><span className="text-yellow-400">/plan</span> - Generate implementation plans</li>
          <li><span className="text-yellow-400">/tasks</span> - Manage tasks</li>
          <li><span className="text-yellow-400">/implement</span> - Implement with AI</li>
          <li><span className="text-yellow-400">/debug</span> - Debug issues</li>
          <li><span className="text-yellow-400">/review</span> - Code review</li>
          <li><span className="text-yellow-400">/help</span> - Show help</li>
        </ul>
      </div>
      <p className="mt-4 text-gray-500">
        Type a command or ask a question to get started.
      </p>
    </div>
  );
}

// Output Block Component
function OutputBlockComponent({ block }: { block: OutputBlock }) {
  const isCommand = block.metadata?.type === 'command';

  if (isCommand) {
    return (
      <div className="text-blue-400 font-bold">
        {block.content}
      </div>
    );
  }

  const getBlockStyle = () => {
    switch (block.block_type) {
      case 'Error':
        return 'text-red-400 bg-red-900/20 p-2 rounded';
      case 'Warning':
        return 'text-yellow-400 bg-yellow-900/20 p-2 rounded';
      case 'Info':
        return 'text-blue-400';
      case 'Progress':
        return 'text-gray-400 italic';
      case 'Code':
        return 'bg-gray-800 p-3 rounded border border-gray-700';
      default:
        return '';
    }
  };

  return (
    <div className={getBlockStyle()}>
      <span className="mr-2">{getOutputBlockIcon(block.block_type)}</span>
      <span className="whitespace-pre-wrap">{block.content}</span>
    </div>
  );
}

// Suggestion Card Component
function SuggestionCard({
  suggestion,
  onAccept,
  onReject,
  onModify,
}: {
  suggestion: CodeSuggestion;
  onAccept: () => void;
  onReject: () => void;
  onModify: (content: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(suggestion.suggested_content);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-750 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400">✨</span>
          <span className="font-medium">Suggested Change</span>
          <span className="text-gray-500 text-sm">- {suggestion.file_path}</span>
        </div>
        <span className="text-xs text-gray-500">{suggestion.description}</span>
      </div>

      {/* Diff View */}
      <div className="p-4 max-h-64 overflow-y-auto">
        {suggestion.diff_hunks.map((hunk, i) => (
          <div key={i} className="font-mono text-xs">
            <div className="text-gray-500 mb-1">
              @@ -{hunk.old_start},{hunk.old_lines} +{hunk.new_start},{hunk.new_lines} @@
            </div>
            {hunk.lines.map((line, j) => (
              <div key={j} className={`px-2 ${getDiffLineClass(line.line_type)}`}>
                <span className="select-none mr-2">
                  {line.line_type === 'Addition' ? '+' : line.line_type === 'Deletion' ? '-' : ' '}
                </span>
                {line.content}
              </div>
            ))}
          </div>
        ))}

        {/* Edit Mode */}
        {isEditing && (
          <div className="mt-4">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-32 bg-gray-900 border border-gray-600 rounded p-2 text-sm font-mono"
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-750 border-t border-gray-700">
        <button
          onClick={onAccept}
          className="flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm"
        >
          <span>✓</span> Accept
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
        >
          <span>✗</span> Reject
        </button>
        {isEditing ? (
          <>
            <button
              onClick={() => { onModify(editContent); setIsEditing(false); }}
              className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
            >
              Save
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="flex items-center gap-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm"
          >
            <span>✎</span> Edit
          </button>
        )}
      </div>
    </div>
  );
}

export default CliInterface;
