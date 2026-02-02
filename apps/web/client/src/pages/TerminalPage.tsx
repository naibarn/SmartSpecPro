import { useState, useEffect, useRef, useCallback } from 'react';
import { detectPlatform } from '@smartspec/shared';
import DesktopOnlyMessage from '@/components/DesktopOnlyMessage';
import { tauriInvoke, tauriListen } from '@/hooks/useTauriInvoke';
import { Button } from '@/components/ui/button';
import { Plus, X, Terminal as TerminalIcon } from 'lucide-react';

interface TermSession {
  id: string;
  label: string;
}

export default function TerminalPage() {
  if (detectPlatform() !== 'desktop') {
    return <DesktopOnlyMessage feature="Terminal" />;
  }
  return <TerminalDashboard />;
}

function TerminalDashboard() {
  const [sessions, setSessions] = useState<TermSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const addSession = useCallback(async () => {
    const id = `term-${Date.now()}`;
    const label = `Terminal ${sessions.length + 1}`;
    try {
      await tauriInvoke('pty_spawn', { id, cols: 80, rows: 24 });
      setSessions(prev => [...prev, { id, label }]);
      setActiveId(id);
    } catch (e) {
      console.error('Failed to spawn PTY:', e);
    }
  }, [sessions.length]);

  const removeSession = useCallback(async (id: string) => {
    try {
      await tauriInvoke('pty_kill', { id });
    } catch { /* ignore */ }
    setSessions(prev => prev.filter(s => s.id !== id));
    setActiveId(prev => prev === id ? sessions.find(s => s.id !== id)?.id ?? null : prev);
  }, [sessions]);

  useEffect(() => {
    if (sessions.length === 0) {
      addSession();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Tab bar */}
      <div className="flex items-center border-b bg-muted/30 px-2 gap-1 shrink-0">
        {sessions.map(s => (
          <div
            key={s.id}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm cursor-pointer border-b-2 transition-colors ${
              activeId === s.id
                ? 'border-primary text-foreground bg-background'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveId(s.id)}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            {s.label}
            <button
              onClick={(e) => { e.stopPropagation(); removeSession(s.id); }}
              className="ml-1 rounded-sm hover:bg-muted p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={addSession}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Terminal view */}
      <div className="flex-1 relative bg-background">
        {sessions.map(s => (
          <div key={s.id} className={`absolute inset-0 ${activeId === s.id ? '' : 'hidden'}`}>
            <XtermView sessionId={s.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

function XtermView({ sessionId }: { sessionId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');

      // Get CSS variable values for theming
      const style = getComputedStyle(document.documentElement);
      const bg = style.getPropertyValue('--background').trim();
      const fg = style.getPropertyValue('--foreground').trim();

      const term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
        theme: {
          background: bg ? `oklch(${bg})` : '#0c0a09',
          foreground: fg ? `oklch(${fg})` : '#fafaf9',
          cursor: '#a78bfa',
          selectionBackground: 'rgba(167, 139, 250, 0.3)',
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);

      if (containerRef.current) {
        term.open(containerRef.current);
        fitAddon.fit();
      }

      termRef.current = term;

      // Resize PTY when terminal resizes
      const observer = new ResizeObserver(() => {
        fitAddon.fit();
        tauriInvoke('pty_resize', {
          id: sessionId,
          cols: term.cols,
          rows: term.rows,
        }).catch(() => {});
      });
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      // Send initial resize
      await tauriInvoke('pty_resize', {
        id: sessionId,
        cols: term.cols,
        rows: term.rows,
      }).catch(() => {});

      // Handle user input → PTY
      const onData = term.onData((data) => {
        tauriInvoke('pty_write', { id: sessionId, data }).catch(() => {});
      });

      // Listen PTY output → terminal
      const unlisten = await tauriListen<{ id: string; data: string }>('pty-output', (payload) => {
        if (payload.id === sessionId) {
          term.write(payload.data);
        }
      });

      cleanup = () => {
        onData.dispose();
        unlisten();
        observer.disconnect();
        term.dispose();
      };
    })();

    return () => {
      cleanup?.();
    };
  }, [sessionId]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ padding: 4 }}
    />
  );
}
