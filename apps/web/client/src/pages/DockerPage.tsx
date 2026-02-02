import { useState, useEffect, useCallback } from 'react';
import { detectPlatform } from '@smartspec/shared';
import DesktopOnlyMessage from '@/components/DesktopOnlyMessage';
import { tauriInvoke } from '@/hooks/useTauriInvoke';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Play, Square, RotateCw, Trash2, FileText, RefreshCw,
  Download, HardDrive, Server, Cpu, MemoryStick, Loader2,
} from 'lucide-react';

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: string[];
  uptime: string;
}

interface ImageInfo {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

interface DockerInfo {
  version: string;
  containers_total: number;
  containers_running: number;
  containers_paused: number;
  containers_stopped: number;
  images: number;
  available: boolean;
  error: string | null;
}

interface ContainerLogs {
  logs: string;
}

function statusColor(state: string) {
  switch (state.toLowerCase()) {
    case 'running': return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
    case 'exited': return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'paused': return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';
    case 'restarting': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

export default function DockerPage() {
  if (detectPlatform() !== 'desktop') {
    return <DesktopOnlyMessage feature="Docker" />;
  }
  return <DockerDashboard />;
}

function DockerDashboard() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [images, setImages] = useState<ImageInfo[]>([]);
  const [info, setInfo] = useState<DockerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [logsId, setLogsId] = useState<string | null>(null);
  const [logs, setLogs] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [c, i, d] = await Promise.all([
        tauriInvoke<ContainerInfo[]>('docker_list_containers'),
        tauriInvoke<ImageInfo[]>('docker_list_images'),
        tauriInvoke<DockerInfo>('docker_check'),
      ]);
      setContainers(c);
      setImages(i);
      setInfo(d);
    } catch {
      // Docker may not be available
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  const containerAction = async (action: string, id: string) => {
    setActionLoading(id);
    try {
      switch (action) {
        case 'start': await tauriInvoke('docker_start_container', { id }); break;
        case 'stop': await tauriInvoke('docker_stop_container', { id }); break;
        case 'restart': await tauriInvoke('docker_restart_container', { id }); break;
        case 'remove': await tauriInvoke('docker_remove_container', { id, force: true }); break;
      }
      await refresh();
    } finally {
      setActionLoading(null);
    }
  };

  const showLogs = async (id: string) => {
    setLogsId(id);
    try {
      const result = await tauriInvoke<ContainerLogs>('docker_container_logs', { id, tail: 200 });
      setLogs(result.logs);
    } catch (e) {
      setLogs(String(e));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (info && !info.available) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Docker Sandbox</h1>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center space-y-3">
              <Server className="w-12 h-12 mx-auto text-muted-foreground" />
              <p className="text-lg font-medium">Docker is not available</p>
              <p className="text-sm text-muted-foreground">{info.error || 'Please install and start Docker.'}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Docker Sandbox</h1>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="containers">
        <TabsList>
          <TabsTrigger value="containers">Containers ({containers.length})</TabsTrigger>
          <TabsTrigger value="images">Images ({images.length})</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="containers" className="space-y-3 mt-4">
          {containers.length === 0 ? (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">No containers found</CardContent></Card>
          ) : containers.map(c => (
            <Card key={c.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{c.name}</span>
                      <Badge variant="outline" className={statusColor(c.state)}>{c.state}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>{c.image}</span>
                      <span>{c.uptime}</span>
                      {c.ports.length > 0 && <span>{c.ports.join(', ')}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.state.toLowerCase() !== 'running' && (
                      <Button variant="ghost" size="icon" onClick={() => containerAction('start', c.id)} disabled={actionLoading === c.id} title="Start">
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    {c.state.toLowerCase() === 'running' && (
                      <Button variant="ghost" size="icon" onClick={() => containerAction('stop', c.id)} disabled={actionLoading === c.id} title="Stop">
                        <Square className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => containerAction('restart', c.id)} disabled={actionLoading === c.id} title="Restart">
                      <RotateCw className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => showLogs(c.id)} title="Logs">
                      <FileText className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => containerAction('remove', c.id)} disabled={actionLoading === c.id} title="Remove" className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {logsId && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Logs: {logsId.slice(0, 12)}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setLogsId(null)}>Close</Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted rounded-lg p-4 text-xs font-mono max-h-80 overflow-auto whitespace-pre-wrap">{logs || 'No logs available'}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="images" className="space-y-3 mt-4">
          {images.length === 0 ? (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">No images found</CardContent></Card>
          ) : images.map(img => (
            <Card key={img.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold">{img.repository}</span>
                    <span className="text-muted-foreground">:{img.tag}</span>
                    <div className="text-sm text-muted-foreground mt-1 flex gap-4">
                      <span>{img.size}</span>
                      <span>{img.id.slice(0, 12)}</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => tauriInvoke('docker_remove_image', { id: img.id, force: false }).then(refresh)} title="Remove" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="system" className="mt-4">
          {info && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <Server className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <div className="text-2xl font-bold">{info.version || '—'}</div>
                  <div className="text-sm text-muted-foreground">Docker Version</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <HardDrive className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <div className="text-2xl font-bold">{info.containers_total}</div>
                  <div className="text-sm text-muted-foreground">Total Containers</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <Cpu className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <div className="text-2xl font-bold">{info.containers_running}</div>
                  <div className="text-sm text-muted-foreground">Running</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <MemoryStick className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <div className="text-2xl font-bold">{info.images}</div>
                  <div className="text-sm text-muted-foreground">Images</div>
                </CardContent>
              </Card>
            </div>
          )}
          <div className="mt-4">
            <Button variant="destructive" size="sm" onClick={() => tauriInvoke('docker_prune').then(refresh)} className="gap-2">
              <Trash2 className="w-4 h-4" /> Prune System
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
