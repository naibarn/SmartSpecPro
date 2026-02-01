// Code Editor Component
// Simple code viewer with syntax highlighting placeholder

import { useState, useEffect, useRef } from 'react';
import { useCli, FileContent, getLanguageIcon } from '../../services/cliService';

interface CodeEditorProps {
  className?: string;
}

export function CodeEditor({ className = '' }: CodeEditorProps) {
  const { selectedFile } = useCli();
  const [content, setContent] = useState('');
  const [isModified, setIsModified] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selectedFile) {
      setContent(selectedFile.content);
      setIsModified(false);
    }
  }, [selectedFile]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsModified(true);
  };

  if (!selectedFile) {
    return (
      <div className={`flex items-center justify-center h-full bg-gray-900 text-gray-500 ${className}`}>
        <div className="text-center">
          <div className="text-4xl mb-4">📄</div>
          <p>Select a file to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-gray-900 ${className}`}>
      {/* Tab Bar */}
      <div className="flex items-center bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-r border-gray-700">
          <span>{getLanguageIcon(selectedFile.language)}</span>
          <span className="text-sm text-gray-300">
            {selectedFile.path.split('/').pop()}
          </span>
          {isModified && (
            <span className="w-2 h-2 bg-yellow-500 rounded-full" title="Modified" />
          )}
          <button className="ml-2 text-gray-500 hover:text-white">×</button>
        </div>
      </div>

      {/* Editor Info Bar */}
      <div className="flex items-center justify-between px-4 py-1 bg-gray-800 border-b border-gray-700 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <span>{selectedFile.path}</span>
          <span>{selectedFile.language}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{selectedFile.line_count} lines</span>
          <span>UTF-8</span>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Line Numbers */}
        <div className="flex-shrink-0 w-12 bg-gray-850 border-r border-gray-700 text-right pr-2 py-2 font-mono text-xs text-gray-600 select-none overflow-hidden">
          {content.split('\n').map((_, i) => (
            <div key={i} className="leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Code Area */}
        <div className="flex-1 overflow-auto">
          <textarea
            ref={editorRef}
            value={content}
            onChange={handleChange}
            className="w-full h-full bg-transparent text-gray-300 font-mono text-sm p-2 resize-none outline-none leading-5"
            spellCheck={false}
            style={{ tabSize: 2 }}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1 bg-gray-800 border-t border-gray-700 text-xs">
        <div className="flex items-center gap-4 text-gray-500">
          <span>Ln 1, Col 1</span>
          <span>Spaces: 2</span>
        </div>
        <div className="flex items-center gap-2">
          {isModified && (
            <span className="text-yellow-500">Modified</span>
          )}
          <span className="text-gray-500">{selectedFile.language}</span>
        </div>
      </div>
    </div>
  );
}

export default CodeEditor;
