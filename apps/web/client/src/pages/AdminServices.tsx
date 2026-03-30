/**
 * Admin Services Management Page - SmartAIHub
 * Monitor and control all services (like dev.sh)
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { OpsEarlyWarningPanel } from '@/components/admin/OpsEarlyWarningPanel';
import { toast } from 'sonner';
import {
  Server,
  Database,
  Cpu,
  Activity,
  Power,
  RefreshCw,
  RotateCcw,
  Square,
  Play,
  Terminal,
  Clock,
  Wifi,
  WifiOff,
  AlertCircle,
  CheckCircle,
  Circle,
  ChevronLeft,
  Eye,
  Download,
  Box,
  ChevronDown,
  ChevronUp,
  Image,
} from 'lucide-react';

type ServiceStatus = 'running' | 'stopped' | 'starting' | 'unhealthy' | 'unknown';

type ServiceType = 'docker' | 'host' | 'systemd';

interface Service {
  id: string;
  name: string;
  displayName: string;
  status: ServiceStatus;
  uptime: string;
  ports: string[];
  type: ServiceType;
  description?: string;
  healthCheck?: string;
  cpu?: number;
  memory?: number;
  restarts?: number;
}

interface MemoryInfo {
  total: number;
  used: number;
  free: number;
  available: number;
  usedPercent: number;
}

interface DiskInfo {
  total: number;
  used: number;
  available: number;
  usedPercent: number;
  mountPoint: string;
}

interface DockerDiskInfo {
  volumesSize: number;
  imagesSize: number;
  totalUsed: number;
}

interface GPUInfo {
  id: number;
  name: string;
  utilization: number;
  memoryUsed: number;
  memoryTotal: number;
  memoryPercent: number;
  temperature: number;
  powerUsage: number;
  powerLimit: number;
}

interface SystemInfo {
  memory: MemoryInfo | null;
  disk: DiskInfo | null;
  gpu: GPUInfo[] | null;
  docker: DockerDiskInfo | null;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[];
  created: string;
  networks: string[];
}

interface DockerContainerData {
  containers: DockerContainer[];
  summary: {
    total: number;
    running: number;
    stopped: number;
    images: number;
  };
}

const sanitizeBrandingText = (value: string): string =>
  value
    .replace(/smartspecpro/gi, "smartaihub")
    .replace(/smartspec/gi, "smartaihub");

export default function AdminServices() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [services, setServices] = useState<Service[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [dockerData, setDockerData] = useState<DockerContainerData | null>(null);
  const [dockerExpanded, setDockerExpanded] = useState(true);
  const opsOverviewQuery = trpc.monitoring.getOpsOverview.useQuery(undefined, {
    enabled: Boolean(user && user.role === 'admin'),
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
      return;
    }
    if (user && user.role !== 'admin') {
      setLocation('/dashboard');
    }
  }, [isLoading, isAuthenticated, user, setLocation]);

  useEffect(() => {
    fetchServices();
    fetchDockerContainers();
    const interval = setInterval(fetchServices, 5000); // Auto-refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const fetchServices = async () => {
    try {
      const response = await fetch('/api/admin/services/status', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const sanitizedServices = (data.services || []).map((service: Service) => ({
          ...service,
          name: sanitizeBrandingText(service.name || ""),
          displayName: sanitizeBrandingText(service.displayName || ""),
          description: sanitizeBrandingText(service.description || ""),
        }));
        setServices(sanitizedServices);
        setSystemInfo(data.system || null);
      } else {
        console.error('Failed to fetch services:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    }
  };

  const fetchDockerContainers = async () => {
    try {
      const response = await fetch('/api/admin/services/docker/containers', {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const sanitizedContainers = (data.containers || []).map((container: DockerContainer) => ({
          ...container,
          name: sanitizeBrandingText(container.name || ""),
          image: sanitizeBrandingText(container.image || ""),
          status: sanitizeBrandingText(container.status || ""),
          networks: (container.networks || []).map((network) => sanitizeBrandingText(network)),
        }));
        setDockerData({
          ...data,
          containers: sanitizedContainers,
        });
      }
    } catch (error) {
      console.error('Failed to fetch Docker containers:', error);
    }
  };

  const handleServiceAction = async (service: Service, action: 'start' | 'stop' | 'restart') => {
    const serviceId = service.id;
    const serviceLabel = sanitizeBrandingText(service.displayName || service.name || "service");
    setActionLoading(`${serviceId}-${action}`);

    // Show loading toast
    const loadingToast = toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing ${serviceLabel}...`);

    try {
      const response = await fetch(`/api/admin/services/${serviceId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });

      toast.dismiss(loadingToast);

      if (response.ok) {
        await response.json();
        toast.success(`${serviceLabel} ${action === 'start' ? 'started' : action === 'stop' ? 'stopped' : 'restarted'} successfully!`, {
          duration: 3000
        });
        setTimeout(() => fetchServices(), 1000);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = sanitizeBrandingText(errorData.error || response.statusText || "Unknown error");
        toast.error(
          `Failed to ${action} ${serviceLabel}: ${errorMessage}`,
          { duration: 5000 }
        );
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error(`Failed to ${action} service:`, error);
      toast.error(
        `Network error: Failed to ${action} ${serviceLabel}`,
        { duration: 5000 }
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchServices(), fetchDockerContainers(), opsOverviewQuery.refetch()]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleViewLogs = async (service: Service) => {
    setSelectedService(service);
    try {
      const response = await fetch(`/api/admin/services/${service.id}/logs`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(sanitizeBrandingText(data.logs || 'No logs available'));
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setLogs('Error loading logs');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return null;
  }

  const getStatusIcon = (status: ServiceStatus) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'stopped':
        return <Square className="w-5 h-5 text-gray-400" />;
      case 'starting':
        return <Circle className="w-5 h-5 text-yellow-500 animate-pulse" />;
      case 'unhealthy':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Circle className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ServiceStatus) => {
    switch (status) {
      case 'running':
        return 'text-green-600 bg-green-50';
      case 'stopped':
        return 'text-gray-600 bg-gray-50';
      case 'starting':
        return 'text-yellow-600 bg-yellow-50';
      case 'unhealthy':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getContainerStateColor = (state: string) => {
    switch (state) {
      case 'running': return 'text-green-600 bg-green-50';
      case 'exited': return 'text-gray-600 bg-gray-50';
      case 'created': return 'text-blue-600 bg-blue-50';
      case 'paused': return 'text-yellow-600 bg-yellow-50';
      case 'restarting': return 'text-orange-600 bg-orange-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getContainerStateIcon = (state: string) => {
    switch (state) {
      case 'running': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'exited': return <Square className="w-4 h-4 text-gray-400" />;
      case 'paused': return <Circle className="w-4 h-4 text-yellow-500" />;
      case 'restarting': return <RefreshCw className="w-4 h-4 text-orange-500 animate-spin" />;
      default: return <Circle className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatRelativeTime = (isoDate: string) => {
    if (!isoDate) return '-';
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'just now';
  };

  const runningServices = services.filter(s => s.status === 'running').length;
  const stoppedServices = services.filter(s => s.status === 'stopped').length;
  const unhealthyServices = services.filter(s => s.status === 'unhealthy').length;

  // Calculate total resource usage
  const totalCpu = services.reduce((sum, s) => sum + (s.cpu || 0), 0);
  const totalMemory = services.reduce((sum, s) => sum + (s.memory || 0), 0);
  const avgCpu = runningServices > 0 ? totalCpu / runningServices : 0;
  const avgMemory = runningServices > 0 ? totalMemory / runningServices : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation('/admin/dashboard')}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Command Center
              </Button>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Server className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Services Management</h1>
                  <p className="text-sm text-gray-500">Monitor and control all services</p>
                </div>
              </div>
            </div>
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-8"
        >
          <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-8 h-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{services.length}</div>
                <div className="text-sm text-gray-500">Total Services</div>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Wifi className="w-8 h-8 text-green-500" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{runningServices}</div>
                <div className="text-sm text-gray-500">Running</div>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <WifiOff className="w-8 h-8 text-gray-400" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{stoppedServices}</div>
                <div className="text-sm text-gray-500">Stopped</div>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{unhealthyServices}</div>
                <div className="text-sm text-gray-500">Unhealthy</div>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Cpu className="w-8 h-8 text-purple-500" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{avgCpu.toFixed(1)}%</div>
                <div className="text-sm text-gray-500">Avg CPU</div>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-8 h-8 text-blue-500" />
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {systemInfo?.memory
                    ? `${systemInfo.memory.available / 1024 >= 1
                        ? `${(systemInfo.memory.available / 1024).toFixed(1)}GB`
                        : `${systemInfo.memory.available}MB`} / ${(systemInfo.memory.total / 1024).toFixed(1)}GB`
                    : 'N/A'}
                </div>
                <div className="text-sm text-gray-500">
                  RAM Available {systemInfo?.memory ? `(${100 - systemInfo.memory.usedPercent}%)` : ''}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-8 h-8 text-orange-500" />
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {systemInfo?.disk
                    ? `${systemInfo.disk.available.toFixed(1)}GB / ${systemInfo.disk.total.toFixed(1)}GB`
                    : 'N/A'}
                </div>
                <div className="text-sm text-gray-500">
                  Storage Available {systemInfo?.disk ? `(${100 - systemInfo.disk.usedPercent}%)` : ''}
                </div>
              </div>
            </div>
          </div>

          {/* GPU Cards - show each GPU separately */}
          {systemInfo?.gpu && systemInfo.gpu.length > 0 && systemInfo.gpu.map((gpu) => (
            <div key={gpu.id} className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/50 shadow-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <Cpu className="w-8 h-8 text-green-500" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-600 mb-1">
                    GPU {gpu.id}: {gpu.name.length > 20 ? gpu.name.substring(0, 20) + '...' : gpu.name}
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {gpu.utilization.toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    VRAM: {gpu.memoryUsed.toFixed(1)}/{gpu.memoryTotal.toFixed(1)}GB ({gpu.memoryPercent}%)
                  </div>
                  <div className="text-xs text-gray-500">
                    {gpu.temperature > 0 && `${gpu.temperature}°C`}
                    {gpu.powerUsage > 0 && ` • ${gpu.powerUsage.toFixed(0)}W/${gpu.powerLimit.toFixed(0)}W`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
          className="mb-8"
        >
          <OpsEarlyWarningPanel
            overview={opsOverviewQuery.data}
            isLoading={opsOverviewQuery.isLoading}
            showMonitoringLink
            description="Unified warning feed across metrics, alerts, audit logs, and orchestration so service anomalies show up before they turn into downtime."
          />
        </motion.div>

        {/* Docker Containers Section */}
        {dockerData && dockerData.containers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg overflow-hidden mb-8"
          >
            <div
              className="p-6 border-b border-gray-200/50 flex items-center justify-between cursor-pointer"
              onClick={() => setDockerExpanded(!dockerExpanded)}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                  <Box className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Docker Containers</h2>
                  <p className="text-sm text-gray-500">
                    {dockerData.summary.total} containers &middot;{' '}
                    <span className="text-green-600">{dockerData.summary.running} running</span>
                    {dockerData.summary.stopped > 0 && (
                      <> &middot; <span className="text-gray-500">{dockerData.summary.stopped} stopped</span></>
                    )}
                    {' '}&middot; {dockerData.summary.images} images
                  </p>
                </div>
              </div>
              {dockerExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </div>

            {dockerExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Container
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Image
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ports
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Networks
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/50">
                    {dockerData.containers.map((container) => (
                      <tr key={container.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {getContainerStateIcon(container.state)}
                            <div>
                              <div className="font-medium text-gray-900">{container.name}</div>
                              <div className="text-xs text-gray-400 font-mono">{container.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Image className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-sm text-gray-700 font-mono max-w-[200px] truncate" title={container.image}>
                              {container.image}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${getContainerStateColor(container.state)}`}>
                            {container.state}
                          </span>
                          <div className="text-xs text-gray-500 mt-0.5">{container.status}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {container.ports.length > 0 ? (
                            <div className="space-y-0.5">
                              {container.ports.slice(0, 3).map((port, i) => (
                                <div key={i} className="text-xs font-mono">{port}</div>
                              ))}
                              {container.ports.length > 3 && (
                                <div className="text-xs text-gray-400">+{container.ports.length - 3} more</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {container.networks.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {container.networks.map((net) => (
                                <span key={net} className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-50 text-purple-700">
                                  {net}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatRelativeTime(container.created)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        )}

        {/* Services List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg overflow-hidden"
        >
          <div className="p-6 border-b border-gray-200/50">
            <h2 className="text-lg font-bold text-gray-900">Services</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uptime
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ports
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resources
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/50">
                {services.map((service) => (
                  <tr key={service.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(service.status)}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{service.displayName}</span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                              service.type === 'docker' ? 'bg-blue-100 text-blue-700' :
                              service.type === 'host' ? 'bg-green-100 text-green-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {service.type === 'docker' ? 'Docker' :
                               service.type === 'host' ? 'Host' : 'System'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {sanitizeBrandingText(service.description || "Service process")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(service.status)}`}>
                        {service.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        {service.uptime}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {service.ports.length > 0 ? service.ports.join(', ') : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {service.cpu !== undefined && service.memory !== undefined ? (
                        <div className="space-y-2 min-w-[120px]">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1">
                                <Cpu className="w-3 h-3 text-gray-400" />
                                <span className="text-xs">CPU</span>
                              </div>
                              <span className="text-xs font-medium">{service.cpu.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${
                                  service.cpu > 80 ? 'bg-red-500' :
                                  service.cpu > 50 ? 'bg-yellow-500' :
                                  'bg-green-500'
                                }`}
                                style={{ width: `${Math.min(100, service.cpu)}%` }}
                              />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1">
                                <Database className="w-3 h-3 text-gray-400" />
                                <span className="text-xs">RAM</span>
                              </div>
                              <span className="text-xs font-medium">{service.memory.toFixed(0)}MB</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-500 h-1.5 rounded-full"
                                style={{ width: `${Math.min(100, (service.memory / 2048) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewLogs(service)}
                          className="text-gray-600"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {service.status === 'stopped' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleServiceAction(service, 'start')}
                            disabled={actionLoading === `${service.id}-start`}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleServiceAction(service, 'restart')}
                              disabled={actionLoading === `${service.id}-restart`}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleServiceAction(service, 'stop')}
                              disabled={actionLoading === `${service.id}-stop`}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Square className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Logs Modal */}
        {selectedService && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setSelectedService(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Terminal className="w-5 h-5 text-gray-600" />
                  <h3 className="text-lg font-bold text-gray-900">
                    Logs: {sanitizeBrandingText(selectedService.displayName)}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedService(null)}>
                    Close
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6">
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto">
                  {logs}
                </pre>
              </div>
            </motion.div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
