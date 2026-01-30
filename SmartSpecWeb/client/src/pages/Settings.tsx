/**
 * Settings Page - SmartSpec Pro
 * User settings and preferences
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Settings as SettingsIcon,
  User,
  Mail,
  Lock,
  Bell,
  Palette,
  Globe,
  Shield,
  Key,
  CreditCard,
  ChevronLeft,
  Save,
  Upload,
  Check,
  X,
  Eye,
  EyeOff,
  Trash2,
  AlertCircle,
  Loader2,
  Languages,
  Search,
  Bot,
} from 'lucide-react';

type SettingsTab = 'profile' | 'account' | 'security' | 'preferences' | 'api' | 'billing';

export default function Settings() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [showPassword, setShowPassword] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Delete account states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleteError, setDeleteError] = useState('');

  // Delete account mutation
  const deleteAccountMutation = trpc.users.deleteAccount.useMutation({
    onSuccess: async () => {
      // Logout and redirect to home after deletion
      await logout();
      setLocation('/');
    },
    onError: (error) => {
      setDeleteError(error.message);
    },
  });

  // Context7 states
  const [context7Key, setContext7Key] = useState('');
  const [showContext7Key, setShowContext7Key] = useState(false);

  const { data: context7Data, refetch: refetchContext7 } =
    trpc.systemSettings.getContext7Key.useQuery(undefined, {
      enabled: isAuthenticated,
    });

  const saveContext7Mutation = trpc.systemSettings.saveContext7Key.useMutation({
    onSuccess: () => {
      toast.success("Context7 API key saved");
      setContext7Key('');
      refetchContext7();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteContext7Mutation = trpc.systemSettings.deleteContext7Key.useMutation({
    onSuccess: () => {
      toast.success("Context7 API key removed");
      refetchContext7();
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('light');

  // Translation preferences
  const [translationLanguage, setTranslationLanguage] = useState('');
  const [translationModel, setTranslationModel] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);

  const { data: prefsData, isLoading: prefsLoading } = trpc.users.getPreferences.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: modelsData } = trpc.llmProviders.availableModels.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const updatePrefsMutation = trpc.users.updatePreferences.useMutation({
    onSuccess: () => toast.success('Translation preferences saved'),
    onError: (err: any) => toast.error(err.message),
  });

  useEffect(() => {
    if (prefsData) {
      setTranslationLanguage(prefsData.translationLanguage || '');
      setTranslationModel(prefsData.translationModel || '');
    }
  }, [prefsData]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const tabs: Array<{ id: SettingsTab; label: string; icon: any }> = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'account', label: 'Account', icon: Mail },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'preferences', label: 'Preferences', icon: Palette },
    { id: 'api', label: 'API Keys', icon: Key },
    { id: 'billing', label: 'Billing', icon: CreditCard },
  ];

  const handleSave = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50/30 to-pink-50/20">
      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-gray-200/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
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
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center">
                  <SettingsIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Settings</h1>
                  <p className="text-sm text-gray-500">Manage your account settings</p>
                </div>
              </div>
            </div>
            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg"
              >
                <Check className="w-4 h-4" />
                <span className="text-sm font-medium">Settings saved</span>
              </motion.div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Settings Navigation */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-1"
          >
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-4">
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-700'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </motion.div>

          {/* Settings Content */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="lg:col-span-3"
          >
            <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-lg shadow-purple-500/5 p-6">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Profile Information</h2>
                    <p className="text-gray-600">Update your personal details and profile picture</p>
                  </div>

                  <div className="flex items-center gap-6 pb-6 border-b border-gray-200">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-2xl font-bold">
                      {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div>
                      <Button variant="outline" size="sm" className="mb-2">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Photo
                      </Button>
                      <p className="text-xs text-gray-500">JPG, PNG or GIF. Max 2MB.</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Bio
                      </label>
                      <textarea
                        rows={4}
                        placeholder="Tell us about yourself..."
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <Button onClick={handleSave} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              )}

              {/* Account Tab */}
              {activeTab === 'account' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Settings</h2>
                    <p className="text-gray-600">Manage your account preferences</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Mail className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Email Verified</div>
                          <div className="text-sm text-gray-500">{user.email}</div>
                        </div>
                      </div>
                      <Check className="w-5 h-5 text-green-500" />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                          <CreditCard className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Current Plan</div>
                          <div className="text-sm text-gray-500">{user.plan.toUpperCase()}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Upgrade</Button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Language</div>
                          <div className="text-sm text-gray-500">English (US)</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Change</Button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-gray-200">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="font-semibold text-red-900 mb-1">Delete Account</h3>
                          <p className="text-sm text-red-700 mb-3">
                            Permanently delete your account and all associated data. This action cannot be undone.
                          </p>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setDeleteConfirmEmail('');
                              setDeleteError('');
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Account
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Security Settings</h2>
                    <p className="text-gray-600">Manage your password and security preferences</p>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <Button onClick={handleSave} className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    <Lock className="w-4 h-4 mr-2" />
                    Update Password
                  </Button>

                  <div className="pt-6 border-t border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-4">Two-Factor Authentication</h3>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div>
                        <div className="font-medium text-gray-900">2FA Status</div>
                        <div className="text-sm text-gray-500">Add an extra layer of security</div>
                      </div>
                      <Button variant="outline" size="sm">Enable 2FA</Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Preferences Tab */}
              {activeTab === 'preferences' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Preferences</h2>
                    <p className="text-gray-600">Customize your experience</p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">Notifications</h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Bell className="w-5 h-5 text-gray-600" />
                            <div>
                              <div className="font-medium text-gray-900">Email Notifications</div>
                              <div className="text-sm text-gray-500">Receive updates via email</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setEmailNotifications(!emailNotifications)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              emailNotifications ? 'bg-purple-500' : 'bg-gray-300'
                            }`}
                          >
                            <div
                              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                emailNotifications ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div className="flex items-center gap-3">
                            <Bell className="w-5 h-5 text-gray-600" />
                            <div>
                              <div className="font-medium text-gray-900">Push Notifications</div>
                              <div className="text-sm text-gray-500">Receive push notifications</div>
                            </div>
                          </div>
                          <button
                            onClick={() => setPushNotifications(!pushNotifications)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${
                              pushNotifications ? 'bg-purple-500' : 'bg-gray-300'
                            }`}
                          >
                            <div
                              className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                pushNotifications ? 'translate-x-6' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">Appearance</h3>
                      <div className="grid grid-cols-3 gap-3">
                        {(['light', 'dark', 'system'] as const).map((themeOption) => (
                          <button
                            key={themeOption}
                            onClick={() => setTheme(themeOption)}
                            className={`p-4 border-2 rounded-xl text-center transition-all ${
                              theme === themeOption
                                ? 'border-purple-500 bg-purple-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="font-medium text-gray-900 capitalize">{themeOption}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Translation */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Languages className="w-5 h-5" />
                      Translation
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Translation Language
                        </label>
                        <select
                          value={translationLanguage}
                          onChange={(e) => setTranslationLanguage(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white"
                        >
                          <option value="">Select language...</option>
                          <option value="th">Thai</option>
                          <option value="zh">Chinese (Simplified)</option>
                          <option value="zh-TW">Chinese (Traditional)</option>
                          <option value="ja">Japanese</option>
                          <option value="ko">Korean</option>
                          <option value="fr">French</option>
                          <option value="es">Spanish</option>
                          <option value="de">German</option>
                          <option value="pt">Portuguese</option>
                          <option value="ar">Arabic</option>
                          <option value="ru">Russian</option>
                          <option value="hi">Hindi</option>
                          <option value="vi">Vietnamese</option>
                          <option value="id">Indonesian</option>
                          <option value="it">Italian</option>
                          <option value="nl">Dutch</option>
                          <option value="pl">Polish</option>
                          <option value="tr">Turkish</option>
                          <option value="sv">Swedish</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Translation Model
                        </label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setShowModelPicker(!showModelPicker)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-left flex items-center justify-between bg-white hover:border-gray-300 transition-colors"
                          >
                            <span className={translationModel ? 'text-gray-900' : 'text-gray-400'}>
                              {translationModel || 'Select model...'}
                            </span>
                            <Bot className="w-4 h-4 text-gray-400" />
                          </button>
                          {showModelPicker && (
                            <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-64 overflow-hidden">
                              <div className="p-2 border-b border-gray-100">
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                  <input
                                    type="text"
                                    placeholder="Search models..."
                                    value={modelSearch}
                                    onChange={(e) => setModelSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    autoFocus
                                  />
                                </div>
                              </div>
                              <div className="overflow-y-auto max-h-48">
                                {(modelsData?.models || [])
                                  .filter((m: any) => !modelSearch || m.id?.toLowerCase().includes(modelSearch.toLowerCase()) || m.name?.toLowerCase().includes(modelSearch.toLowerCase()))
                                  .map((m: any) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      onClick={() => {
                                        setTranslationModel(m.id);
                                        setShowModelPicker(false);
                                        setModelSearch('');
                                      }}
                                      className={`w-full px-4 py-2 text-left text-sm hover:bg-purple-50 flex items-center justify-between ${
                                        translationModel === m.id ? 'bg-purple-50 text-purple-700' : 'text-gray-700'
                                      }`}
                                    >
                                      <div>
                                        <div className="font-medium">{m.name || m.id}</div>
                                        {m.providerDisplayName && (
                                          <div className="text-xs text-gray-400">{m.providerDisplayName}</div>
                                        )}
                                      </div>
                                      {translationModel === m.id && <Check className="w-4 h-4 text-purple-500" />}
                                    </button>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Dedicated model for translations. Uses credits based on token usage.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      updatePrefsMutation.mutate({
                        translationLanguage: translationLanguage || undefined,
                        translationModel: translationModel || undefined,
                      });
                    }}
                    disabled={updatePrefsMutation.isPending}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                  >
                    {updatePrefsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Preferences
                  </Button>
                </div>
              )}

              {/* API Keys Tab */}
              {activeTab === 'api' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">API Keys</h2>
                    <p className="text-gray-600">Manage your API keys for integration</p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Key className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-blue-900 mb-1">API Documentation</h3>
                        <p className="text-sm text-blue-700">
                          Learn how to integrate SmartSpec Pro with your applications using our API.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900">Production API Key</div>
                        <Button variant="outline" size="sm">Regenerate</Button>
                      </div>
                      <code className="text-sm text-gray-600 bg-white px-3 py-2 rounded border border-gray-200 block">
                        sk_prod_••••••••••••••••••••••••••••
                      </code>
                    </div>

                    <div className="p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900">Development API Key</div>
                        <Button variant="outline" size="sm">Regenerate</Button>
                      </div>
                      <code className="text-sm text-gray-600 bg-white px-3 py-2 rounded border border-gray-200 block">
                        sk_dev_••••••••••••••••••••••••••••
                      </code>
                    </div>
                  </div>

                  <Button className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                    <Key className="w-4 h-4 mr-2" />
                    Create New Key
                  </Button>

                  {/* Context7 API Key */}
                  <div className="border-t border-gray-200 pt-6 mt-6">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">Context7 API Key</h3>
                      {context7Data?.configured && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <Check className="w-3 h-3 mr-1" />
                          Configured
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                      Your personal Context7 API key for fetching up-to-date library documentation in chat.
                      Get a free key at{' '}
                      <a href="https://context7.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">
                        context7.com/dashboard
                      </a>
                    </p>

                    {context7Data?.configured && (
                      <div className="p-3 bg-gray-50 rounded-lg mb-3 flex items-center justify-between">
                        <code className="text-sm text-gray-600">{context7Data.maskedKey}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => deleteContext7Mutation.mutate()}
                          disabled={deleteContext7Mutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showContext7Key ? "text" : "password"}
                          placeholder={context7Data?.configured ? "Enter new key to update..." : "Enter your Context7 API key"}
                          value={context7Key}
                          onChange={(e) => setContext7Key(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowContext7Key(!showContext7Key)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showContext7Key ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <Button
                        onClick={() => saveContext7Mutation.mutate({ apiKey: context7Key })}
                        disabled={!context7Key.trim() || saveContext7Mutation.isPending}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {saveContext7Mutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Billing Tab */}
              {activeTab === 'billing' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Billing Information</h2>
                    <p className="text-gray-600">Manage your payment methods and billing details</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl text-white">
                      <div className="text-sm opacity-90 mb-2">Primary Payment Method</div>
                      <div className="flex items-center gap-3 mb-4">
                        <CreditCard className="w-8 h-8" />
                        <div>
                          <div className="font-semibold">•••• •••• •••• 4242</div>
                          <div className="text-sm opacity-90">Expires 12/25</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                        Update
                      </Button>
                    </div>

                    <div className="p-4 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center">
                      <Button variant="outline">
                        <CreditCard className="w-4 h-4 mr-2" />
                        Add Payment Method
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4">Recent Invoices</h3>
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                          <div>
                            <div className="font-medium text-gray-900">Invoice #{1000 + i}</div>
                            <div className="text-sm text-gray-500">January {i}, 2026</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-900">$45.00</span>
                            <Button variant="ghost" size="sm">
                              Download
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All your data including conversations,
              credits, and settings will be permanently deleted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                To confirm, type your email address: <strong>{user?.email}</strong>
              </label>
              <input
                type="email"
                value={deleteConfirmEmail}
                onChange={(e) => {
                  setDeleteConfirmEmail(e.target.value);
                  setDeleteError('');
                }}
                placeholder="Enter your email to confirm"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>

            {deleteError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {deleteError}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={deleteAccountMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteAccountMutation.mutate({ confirmEmail: deleteConfirmEmail });
              }}
              disabled={deleteAccountMutation.isPending || deleteConfirmEmail.toLowerCase() !== user?.email?.toLowerCase()}
            >
              {deleteAccountMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete My Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
