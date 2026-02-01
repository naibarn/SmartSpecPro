// Activity Feed Component
// Display recent team activity

import {
  useCollaboration,
  Activity,
  ActivityType,
  formatRelativeTime,
} from '../../services/collaborationService';

interface ActivityFeedProps {
  className?: string;
  limit?: number;
}

export function ActivityFeed({ className = '', limit = 20 }: ActivityFeedProps) {
  const { activityFeed, isLoading } = useCollaboration();

  const displayedActivities = activityFeed.slice(0, limit);

  if (isLoading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Activity Feed
        </h3>
      </div>

      {/* Activity List */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {displayedActivities.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-2">📋</div>
            <p>No activity yet</p>
          </div>
        ) : (
          displayedActivities.map((activity) => (
            <ActivityItem key={activity.id} activity={activity} />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================
// Activity Item
// ============================================

interface ActivityItemProps {
  activity: Activity;
}

function ActivityItem({ activity }: ActivityItemProps) {
  return (
    <div className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center text-sm flex-shrink-0">
          {activity.user_name[0].toUpperCase()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 dark:text-white">
            <span className="font-medium">{activity.user_name}</span>
            {' '}
            <span className="text-gray-600 dark:text-gray-400">
              {getActivityVerb(activity.activity_type)}
            </span>
            {' '}
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {activity.target_name}
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatRelativeTime(activity.timestamp)}
          </p>
        </div>

        {/* Icon */}
        <div className="text-lg flex-shrink-0">
          {getActivityIcon(activity.activity_type)}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Compact Activity Feed (for sidebar)
// ============================================

interface CompactActivityFeedProps {
  className?: string;
  limit?: number;
}

export function CompactActivityFeed({ className = '', limit = 5 }: CompactActivityFeedProps) {
  const { activityFeed } = useCollaboration();

  const displayedActivities = activityFeed.slice(0, limit);

  return (
    <div className={`space-y-2 ${className}`}>
      {displayedActivities.map((activity) => (
        <div
          key={activity.id}
          className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400"
        >
          <span>{getActivityIcon(activity.activity_type)}</span>
          <span className="truncate">
            <span className="font-medium text-gray-900 dark:text-white">
              {activity.user_name}
            </span>
            {' '}
            {getActivityVerb(activity.activity_type)}
            {' '}
            <span className="text-blue-600 dark:text-blue-400">
              {activity.target_name}
            </span>
          </span>
          <span className="text-gray-400 flex-shrink-0">
            {formatRelativeTime(activity.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function getActivityIcon(type: ActivityType): string {
  const icons: Record<ActivityType, string> = {
    created: '➕',
    updated: '✏️',
    deleted: '🗑️',
    commented: '💬',
    reviewed: '👀',
    assigned: '👤',
    completed: '✅',
    moved: '📦',
    shared: '🔗',
  };
  return icons[type];
}

function getActivityVerb(type: ActivityType): string {
  const verbs: Record<ActivityType, string> = {
    created: 'created',
    updated: 'updated',
    deleted: 'deleted',
    commented: 'commented on',
    reviewed: 'reviewed',
    assigned: 'was assigned to',
    completed: 'completed',
    moved: 'moved',
    shared: 'shared',
  };
  return verbs[type];
}

export default ActivityFeed;
