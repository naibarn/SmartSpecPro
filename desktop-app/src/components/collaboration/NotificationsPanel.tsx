// Notifications Panel Component
// Display and manage user notifications

import {
  useCollaboration,
  Notification,
  getNotificationIcon,
  formatRelativeTime,
} from '../../services/collaborationService';

interface NotificationsPanelProps {
  className?: string;
  onClose?: () => void;
}

export function NotificationsPanel({ className = '', onClose }: NotificationsPanelProps) {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  } = useCollaboration();

  return (
    <div className={`flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Notifications
          </h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-blue-600 hover:underline"
            >
              Mark all as read
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto max-h-96">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="text-4xl mb-2">🔔</div>
            <p>No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onRead={() => markAsRead(notification.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Notification Item
// ============================================

interface NotificationItemProps {
  notification: Notification;
  onRead: () => void;
}

function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const handleClick = () => {
    if (!notification.read) {
      onRead();
    }
    // Navigate to link if available
    if (notification.link) {
      // Handle navigation
      console.log('Navigate to:', notification.link);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
        !notification.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
      }`}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-lg">
          {getNotificationIcon(notification.notification_type)}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm ${!notification.read ? 'font-semibold' : ''} text-gray-900 dark:text-white`}>
              {notification.title}
            </p>
            {!notification.read && (
              <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0 mt-1.5" />
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
            {notification.message}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {formatRelativeTime(notification.created_at)}
          </p>
        </div>
      </div>
    </button>
  );
}

// ============================================
// Notification Bell (for header)
// ============================================

interface NotificationBellProps {
  onClick: () => void;
}

export function NotificationBell({ onClick }: NotificationBellProps) {
  const { unreadCount } = useCollaboration();

  return (
    <button
      onClick={onClick}
      className="relative p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
    >
      <span className="text-xl">🔔</span>
      {unreadCount > 0 && (
        <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}

export default NotificationsPanel;
