import { useState, useEffect } from "react";
import { 
  User, 
  Mail, 
  Calendar, 
  Shield, 
  Key, 
  Activity,
  Settings,
  LogOut,
  Edit2,
  Save,
  X
} from "lucide-react";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  createdAt: string;
  lastLogin: string;
  role: string;
  apiKeysConfigured: number;
  workspacesCount: number;
  totalSessions: number;
}

export function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      // Mock profile data - replace with actual API call
      const mockProfile: UserProfile = {
        id: "user-001",
        name: "Developer",
        email: "developer@example.com",
        createdAt: "2026-01-01T00:00:00Z",
        lastLogin: new Date().toISOString(),
        role: "Admin",
        apiKeysConfigured: 3,
        workspacesCount: 5,
        totalSessions: 127,
      };
      setProfile(mockProfile);
      setEditName(mockProfile.name);
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    
    try {
      // Save profile - replace with actual API call
      setProfile({ ...profile, name: editName });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save profile:", error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">Failed to load profile</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="text-gray-400 mt-1">Manage your account settings and preferences</p>
        </div>

        {/* Profile Card */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                {profile.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-gray-700 text-white px-3 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={handleSave}
                      className="p-1 text-green-400 hover:text-green-300"
                    >
                      <Save className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditName(profile.name);
                      }}
                      className="p-1 text-gray-400 hover:text-gray-300"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-white">{profile.name}</h2>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-1 text-gray-400 hover:text-gray-300"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <p className="text-gray-400 flex items-center gap-1 mt-1">
                  <Mail className="w-4 h-4" />
                  {profile.email}
                </p>
                <p className="text-gray-500 text-sm flex items-center gap-1 mt-1">
                  <Shield className="w-4 h-4" />
                  {profile.role}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <button className="flex items-center gap-2 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg transition-colors">
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Key className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{profile.apiKeysConfigured}</p>
                <p className="text-gray-400 text-sm">API Keys Configured</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Activity className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{profile.workspacesCount}</p>
                <p className="text-gray-400 text-sm">Workspaces</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <User className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{profile.totalSessions}</p>
                <p className="text-gray-400 text-sm">Total Sessions</p>
              </div>
            </div>
          </div>
        </div>

        {/* Account Details */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Account Details</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <span className="text-gray-400">Account Created</span>
              </div>
              <span className="text-white">{formatDate(profile.createdAt)}</span>
            </div>

            <div className="flex items-center justify-between py-3 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-gray-400" />
                <span className="text-gray-400">Last Login</span>
              </div>
              <span className="text-white">{formatDate(profile.lastLogin)}</span>
            </div>

            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-gray-400" />
                <span className="text-gray-400">User ID</span>
              </div>
              <span className="text-gray-500 font-mono text-sm">{profile.id}</span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="mt-6 bg-red-900/20 border border-red-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Danger Zone</h3>
          <p className="text-gray-400 text-sm mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <button className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">
            Delete Account
          </button>
        </div>
      </div>
    </div>
  );
}

export default Profile;
