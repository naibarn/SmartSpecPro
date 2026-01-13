// OpenCode Layout Component
// Main layout with split panes for file explorer, code editor, and CLI

import { useState, useCallback } from 'react';
import { CliProvider } from '../../services/cliService';
import { FileExplorer } from './FileExplorer';
import { CodeEditor } from './CodeEditor';
import { CliInterface } from './CliInterface';

type LayoutMode = 'default' | 'horizontal' | 'cli-only' | 'editor-only';

interface OpenCodeLayoutProps {
  workspacePath?: string;
}

export function OpenCodeLayout({ workspacePath }: OpenCodeLayoutProps) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('default');
  const [explorerWidth, setExplorerWidth] = useState(250);
  const [cliHeight, setCliHeight] = useState(300);
  const [isResizing, setIsResizing] = useState<'explorer' | 'cli' | null>(null);

  // Handle resize
  const handleMouseDown = useCallback((type: 'explorer' | 'cli') => {
    setIsResizing(type);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isResizing) return;

    if (isResizing === 'explorer') {
      const newWidth = Math.max(150, Math.min(400, e.clientX));
      setExplorerWidth(newWidth);
    } else if (isResizing === 'cli') {
      const container = e.currentTarget as HTMLElement;
      const rect = container.getBoundingClientRect();
      const newHeight = Math.max(150, Math.min(500, rect.bottom - e.clientY));
      setCliHeight(newHeight);
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(null);
  }, []);

  return (
    <CliProvider>
      <div 
        className="flex flex-col h-screen bg-gray-900"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-white">
              <span className="text-green-400">⚡</span> SmartSpecPro
            </h1>
            {workspacePath && (
              <span className="text-sm text-gray-500">
                {workspacePath.split('/').pop()}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Layout Buttons */}
            <div className="flex items-center bg-gray-700 rounded">
              <button
                onClick={() => setLayoutMode('default')}
                className={`px-2 py-1 text-xs rounded-l ${layoutMode === 'default' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
                title="Default Layout"
              >
                ⊞
              </button>
              <button
                onClick={() => setLayoutMode('horizontal')}
                className={`px-2 py-1 text-xs ${layoutMode === 'horizontal' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
                title="Horizontal Split"
              >
                ⊟
              </button>
              <button
                onClick={() => setLayoutMode('cli-only')}
                className={`px-2 py-1 text-xs ${layoutMode === 'cli-only' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
                title="CLI Only"
              >
                ⌨
              </button>
              <button
                onClick={() => setLayoutMode('editor-only')}
                className={`px-2 py-1 text-xs rounded-r ${layoutMode === 'editor-only' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
                title="Editor Only"
              >
                📝
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Explorer */}
          {(layoutMode === 'default' || layoutMode === 'horizontal' || layoutMode === 'editor-only') && (
            <>
              <div style={{ width: explorerWidth }} className="flex-shrink-0">
                <FileExplorer className="h-full" />
              </div>
              
              {/* Explorer Resize Handle */}
              <div
                className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0"
                onMouseDown={() => handleMouseDown('explorer')}
              />
            </>
          )}

          {/* Editor + CLI Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {layoutMode === 'default' && (
              <>
                {/* Code Editor */}
                <div className="flex-1 overflow-hidden">
                  <CodeEditor className="h-full" />
                </div>
                
                {/* CLI Resize Handle */}
                <div
                  className="h-1 bg-gray-700 hover:bg-blue-500 cursor-row-resize flex-shrink-0"
                  onMouseDown={() => handleMouseDown('cli')}
                />
                
                {/* CLI */}
                <div style={{ height: cliHeight }} className="flex-shrink-0">
                  <CliInterface className="h-full" />
                </div>
              </>
            )}

            {layoutMode === 'horizontal' && (
              <div className="flex-1 flex overflow-hidden">
                {/* Code Editor */}
                <div className="flex-1 overflow-hidden">
                  <CodeEditor className="h-full" />
                </div>
                
                {/* Vertical Resize Handle */}
                <div className="w-1 bg-gray-700 hover:bg-blue-500 cursor-col-resize flex-shrink-0" />
                
                {/* CLI */}
                <div className="w-1/2 flex-shrink-0">
                  <CliInterface className="h-full" />
                </div>
              </div>
            )}

            {layoutMode === 'cli-only' && (
              <CliInterface className="h-full" />
            )}

            {layoutMode === 'editor-only' && (
              <CodeEditor className="h-full" />
            )}
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between px-4 py-1 bg-gray-800 border-t border-gray-700 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>🟢 Connected</span>
            <span>Workspace: {workspacePath || 'None'}</span>
          </div>
          <div className="flex items-center gap-4">
            <span>SmartSpecPro v0.1.0</span>
          </div>
        </div>
      </div>
    </CliProvider>
  );
}

export default OpenCodeLayout;
