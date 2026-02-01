/**
 * Admin Services Management Page - SmartSpec Pro
 * Monitor and control all services (like dev.sh)
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
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

interface DiskInfo {
  volumesSize: number;
  imagesSize: number;
  totalUsed: number;
}

export default function AdminServices() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [services, setServices] = useState<Service[]>([]);
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
        setServices(data.services || []);
        setDiskInfo(data.disk || null);
      } else {
        console.error('Failed to fetch services:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    }
  };

  const handleServiceAction = async (serviceId: string, action: 'start' | 'stop' | 'restart') => {
    setActionLoading(`${serviceId}-${action}`);

    // Show loading toast
    const loadingToast = toast.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing service ${serviceId}...`);

    try {
      const response = await fetch(`/api/admin/services/${serviceId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });

      toast.dismiss(loadingToast);

      if (response.ok) {
        const data = await response.json();
        toast.success(
          `Service ${serviceId} ${action === 'start' ? 'started' : action === 'stop' ? 'stopped' : 'restarted'} successfully!`,
          { duration: 3000 }
        );
        setTimeout(() => fetchServices(), 1000);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        toast.error(
          `Failed to ${action} service: ${errorData.error || response.statusText}`,
          { duration: 5000 }
        );
      }
    } catch (error) {
      toast.dismiss(loadingToast);
      console.error(`Failed to ${action} service:`, error);
      toast.error(
        `Network error: Failed to ${action} service ${serviceId}`,
        { duration: 5000 }
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchServices();
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
        setLogs(data.logs || 'No logs available');
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
                onClick={() => setLocation('/dashboard')}
                className="text-gray-600"
              >
                <ChevronLeft className="w-5 h-5 mr-1" />
                Back
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
                <div className="text-2xl font-bold text-gray-900">{totalMemory.toFixed(0)}MB</div>
                <div className="text-sm text-gray-500">Total RAM</div>
              </div>
            </div>
          </div>

          <div className="bg-white/70 backdrop-blur-xl rounded-xl border border-white/50 shadow-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Database className="w-8 h-8 text-orange-500" />
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {diskInfo ? `${diskInfo.totalUsed.toFixed(1)}GB` : 'N/A'}
                </div>
                <div className="text-sm text-gray-500">Disk Used</div>
              </div>
            </div>
          </div>
        </motion.div>

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
                          <div className="text-xs text-gray-500">{service.description || service.id}</div>
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
                            onClick={() => handleServiceAction(service.id, 'start')}
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
                              onClick={() => handleServiceAction(service.id, 'restart')}
                              disabled={actionLoading === `${service.id}-restart`}
                              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleServiceAction(service.id, 'stop')}
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
                    Logs: {selectedService.displayName}
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
