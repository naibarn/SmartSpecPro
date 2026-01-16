// Collaboration Service - Frontend service for Team Collaboration
//
// Provides:
// - User management
// - Comments and discussions
// - Reviews
// - Notifications
// - Activity feed

import { invoke } from '@tauri-apps/api/core';
import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

// ============================================
// Types
// ============================================

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  role: UserRole;
  status: UserStatus;
  last_seen: number;
}

export type UserRole = 'owner' | 'admin' | 'member' | 'viewer';
export type UserStatus = 'online' | 'away' | 'busy' | 'offline';

export interface Comment {
  id: string;
  target_type: CommentTarget;
  target_id: string;
  author_id: string;
  author_name: string;
  content: string;
  mentions: string[];
  reactions: Reaction[];
  replies: Comment[];
  resolved: boolean;
  created_at: number;
  updated_at: number;
}

export type CommentTarget = 'task' | 'spec' | 'document' | 'project' | 'line';

export interface Reaction {
  emoji: string;
  user_id: string;
  user_name: string;
}

export interface Review {
  id: string;
  target_type: ReviewTarget;
  target_id: string;
  reviewer_id: string;
  reviewer_name: string;
  status: ReviewStatus;
  comments: ReviewComment[];
  requested_at: number;
  completed_at?: number;
}

export type ReviewTarget = 'spec' | 'document' | 'task';
export type ReviewStatus = 'pending' | 'in_progress' | 'approved' | 'request_changes' | 'rejected';

export interface ReviewComment {
  id: string;
  line_number?: number;
  content: string;
  suggestion?: string;
  resolved: boolean;
  created_at: number;
}

export interface Notification {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  created_at: number;
}

export type NotificationType =
  | 'mention'
  | 'comment'
  | 'review_request'
  | 'review_completed'
  | 'task_assigned'
  | 'task_completed'
  | 'project_update'
  | 'system';

export interface Activity {
  id: string;
  user_id: string;
  user_name: string;
  activity_type: ActivityType;
  target_type: string;
  target_id: string;
  target_name: string;
  description: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export type ActivityType =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'commented'
  | 'reviewed'
  | 'assigned'
  | 'completed'
  | 'moved'
  | 'shared';

// ============================================
// API Functions
// ============================================

// User APIs
export async function addUser(name: string, email: string, role: UserRole): Promise<User> {
  return invoke('collab_add_user', { name, email, role });
}

export async function getUser(userId: string): Promise<User> {
  return invoke('collab_get_user', { userId });
}

export async function listUsers(): Promise<User[]> {
  return invoke('collab_list_users');
}

export async function setCurrentUser(userId: string): Promise<void> {
  return invoke('collab_set_current_user', { userId });
}

export async function updateUserStatus(userId: string, status: UserStatus): Promise<void> {
  return invoke('collab_update_user_status', { userId, status });
}

// Comment APIs
export async function addComment(targetType: CommentTarget, targetId: string, content: string): Promise<Comment> {
  return invoke('collab_add_comment', { targetType, targetId, content });
}

export async function getComments(targetType: CommentTarget, targetId: string): Promise<Comment[]> {
  return invoke('collab_get_comments', { targetType, targetId });
}

export async function addReply(commentId: string, content: string): Promise<Comment> {
  return invoke('collab_add_reply', { commentId, content });
}

export async function addReaction(commentId: string, emoji: string): Promise<void> {
  return invoke('collab_add_reaction', { commentId, emoji });
}

export async function resolveComment(commentId: string): Promise<void> {
  return invoke('collab_resolve_comment', { commentId });
}

// Review APIs
export async function requestReview(targetType: ReviewTarget, targetId: string, reviewerId: string): Promise<Review> {
  return invoke('collab_request_review', { targetType, targetId, reviewerId });
}

export async function getReview(reviewId: string): Promise<Review> {
  return invoke('collab_get_review', { reviewId });
}

export async function getPendingReviews(userId: string): Promise<Review[]> {
  return invoke('collab_get_pending_reviews', { userId });
}

export async function submitReview(
  reviewId: string,
  status: ReviewStatus,
  comments: { line_number?: number; content: string; suggestion?: string }[]
): Promise<Review> {
  return invoke('collab_submit_review', { reviewId, status, comments });
}

// Notification APIs
export async function getNotifications(userId: string, unreadOnly: boolean): Promise<Notification[]> {
  return invoke('collab_get_notifications', { userId, unreadOnly });
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  return invoke('collab_mark_notification_read', { notificationId });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  return invoke('collab_mark_all_notifications_read', { userId });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return invoke('collab_get_unread_count', { userId });
}

// Activity APIs
export async function getActivityFeed(limit?: number): Promise<Activity[]> {
  return invoke('collab_get_activity_feed', { limit });
}

export async function getUserActivity(userId: string, limit?: number): Promise<Activity[]> {
  return invoke('collab_get_user_activity', { userId, limit });
}

// ============================================
// Collaboration Context
// ============================================

interface CollaborationContextValue {
  // Current user
  currentUser: User | null;
  users: User[];
  
  // Notifications
  notifications: Notification[];
  unreadCount: number;
  
  // Activity
  activityFeed: Activity[];
  
  // Loading state
  isLoading: boolean;
  error: string | null;
  
  // User actions
  login: (userId: string) => Promise<void>;
  logout: () => void;
  loadUsers: () => Promise<void>;
  updateStatus: (status: UserStatus) => Promise<void>;
  
  // Comment actions
  addCommentToTarget: (targetType: CommentTarget, targetId: string, content: string) => Promise<Comment>;
  loadComments: (targetType: CommentTarget, targetId: string) => Promise<Comment[]>;
  replyToComment: (commentId: string, content: string) => Promise<Comment>;
  reactToComment: (commentId: string, emoji: string) => Promise<void>;
  resolveCommentById: (commentId: string) => Promise<void>;
  
  // Review actions
  requestReviewFrom: (targetType: ReviewTarget, targetId: string, reviewerId: string) => Promise<Review>;
  loadPendingReviews: () => Promise<void>;
  submitReviewResult: (reviewId: string, status: ReviewStatus, comments: ReviewComment[]) => Promise<Review>;
  pendingReviews: Review[];
  
  // Notification actions
  loadNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  
  // Activity actions
  loadActivityFeed: () => Promise<void>;
}

const CollaborationContext = createContext<CollaborationContextValue | null>(null);

export function CollaborationProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activityFeed, setActivityFeed] = useState<Activity[]>([]);
  const [pendingReviews, setPendingReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  // Poll notifications when logged in
  useEffect(() => {
    if (!currentUser) return;

    const loadData = async () => {
      await Promise.all([
        loadNotifications(),
        loadActivityFeed(),
        loadPendingReviews(),
      ]);
    };

    loadData();
    const interval = setInterval(loadData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [currentUser]);

  const loadUsers = useCallback(async () => {
    try {
      const userList = await listUsers();
      setUsers(userList);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const login = useCallback(async (userId: string) => {
    setIsLoading(true);
    try {
      const user = await getUser(userId);
      setCurrentUser(user);
      await updateUserStatus(userId, 'online');
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    if (currentUser) {
      updateUserStatus(currentUser.id, 'offline').catch(console.error);
    }
    setCurrentUser(null);
    setNotifications([]);
    setUnreadCount(0);
  }, [currentUser]);

  const updateStatus = useCallback(async (status: UserStatus) => {
    if (!currentUser) return;
    await updateUserStatus(currentUser.id, status);
    setCurrentUser(prev => prev ? { ...prev, status } : null);
  }, [currentUser]);

  const addCommentToTarget = useCallback(async (
    targetType: CommentTarget,
    targetId: string,
    content: string
  ) => {
    return addComment(targetType, targetId, content);
  }, []);

  const loadComments = useCallback(async (targetType: CommentTarget, targetId: string) => {
    return getComments(targetType, targetId);
  }, []);

  const replyToComment = useCallback(async (commentId: string, content: string) => {
    return addReply(commentId, content);
  }, []);

  const reactToComment = useCallback(async (commentId: string, emoji: string) => {
    return addReaction(commentId, emoji);
  }, []);

  const resolveCommentById = useCallback(async (commentId: string) => {
    return resolveComment(commentId);
  }, []);

  const requestReviewFrom = useCallback(async (
    targetType: ReviewTarget,
    targetId: string,
    reviewerId: string
  ) => {
    return requestReview(targetType, targetId, reviewerId);
  }, []);

  const loadPendingReviews = useCallback(async () => {
    if (!currentUser) return;
    try {
      const reviews = await getPendingReviews(currentUser.id);
      setPendingReviews(reviews);
    } catch (e) {
      setError(String(e));
    }
  }, [currentUser]);

  const submitReviewResult = useCallback(async (
    reviewId: string,
    status: ReviewStatus,
    comments: ReviewComment[]
  ) => {
    const result = await submitReview(reviewId, status, comments);
    await loadPendingReviews();
    return result;
  }, [loadPendingReviews]);

  const loadNotifications = useCallback(async () => {
    if (!currentUser) return;
    try {
      const [notifs, count] = await Promise.all([
        getNotifications(currentUser.id, false),
        getUnreadCount(currentUser.id),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (e) {
      setError(String(e));
    }
  }, [currentUser]);

  const markAsRead = useCallback(async (notificationId: string) => {
    await markNotificationRead(notificationId);
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!currentUser) return;
    await markAllNotificationsRead(currentUser.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, [currentUser]);

  const loadActivityFeed = useCallback(async () => {
    try {
      const activities = await getActivityFeed(50);
      setActivityFeed(activities);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const value: CollaborationContextValue = {
    currentUser,
    users,
    notifications,
    unreadCount,
    activityFeed,
    isLoading,
    error,
    pendingReviews,
    login,
    logout,
    loadUsers,
    updateStatus,
    addCommentToTarget,
    loadComments,
    replyToComment,
    reactToComment,
    resolveCommentById,
    requestReviewFrom,
    loadPendingReviews,
    submitReviewResult,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    loadActivityFeed,
  };

  return (
    <CollaborationContext.Provider value={value}>
      {children}
    </CollaborationContext.Provider>
  );
}

export function useCollaboration() {
  const context = useContext(CollaborationContext);
  if (!context) {
    throw new Error('useCollaboration must be used within a CollaborationProvider');
  }
  return context;
}

// ============================================
// Utility Functions
// ============================================

export function getStatusColor(status: UserStatus): string {
  const colors: Record<UserStatus, string> = {
    online: '#22c55e',
    away: '#eab308',
    busy: '#ef4444',
    offline: '#6b7280',
  };
  return colors[status];
}

export function getStatusIcon(status: UserStatus): string {
  const icons: Record<UserStatus, string> = {
    online: '🟢',
    away: '🟡',
    busy: '🔴',
    offline: '⚫',
  };
  return icons[status];
}

export function getReviewStatusColor(status: ReviewStatus): string {
  const colors: Record<ReviewStatus, string> = {
    pending: '#6b7280',
    in_progress: '#3b82f6',
    approved: '#22c55e',
    request_changes: '#f59e0b',
    rejected: '#ef4444',
  };
  return colors[status];
}

export function getNotificationIcon(type: NotificationType): string {
  const icons: Record<NotificationType, string> = {
    mention: '@',
    comment: '💬',
    review_request: '👀',
    review_completed: '✅',
    task_assigned: '📋',
    task_completed: '🎉',
    project_update: '📢',
    system: '⚙️',
  };
  return icons[type];
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}
