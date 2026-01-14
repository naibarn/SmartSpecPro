// Comments Panel Component
// Display and manage comments for any target

import { useState, useEffect } from 'react';
import {
  useCollaboration,
  Comment,
  CommentTarget,
  formatRelativeTime,
} from '../../services/collaborationService';

interface CommentsPanelProps {
  targetType: CommentTarget;
  targetId: string;
  className?: string;
}

export function CommentsPanel({ targetType, targetId, className = '' }: CommentsPanelProps) {
  const {
    currentUser,
    loadComments,
    addCommentToTarget,
    replyToComment,
    reactToComment,
    resolveCommentById,
  } = useCollaboration();

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  useEffect(() => {
    loadCommentsData();
  }, [targetType, targetId]);

  const loadCommentsData = async () => {
    setIsLoading(true);
    try {
      const data = await loadComments(targetType, targetId);
      setComments(data);
    } catch (e) {
      console.error('Failed to load comments:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    try {
      await addCommentToTarget(targetType, targetId, newComment.trim());
      setNewComment('');
      await loadCommentsData();
    } catch (e) {
      console.error('Failed to add comment:', e);
    }
  };

  const handleReply = async (commentId: string) => {
    if (!replyContent.trim()) return;
    try {
      await replyToComment(commentId, replyContent.trim());
      setReplyContent('');
      setReplyingTo(null);
      await loadCommentsData();
    } catch (e) {
      console.error('Failed to reply:', e);
    }
  };

  const handleReaction = async (commentId: string, emoji: string) => {
    try {
      await reactToComment(commentId, emoji);
      await loadCommentsData();
    } catch (e) {
      console.error('Failed to add reaction:', e);
    }
  };

  const handleResolve = async (commentId: string) => {
    try {
      await resolveCommentById(commentId);
      await loadCommentsData();
    } catch (e) {
      console.error('Failed to resolve comment:', e);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-white dark:bg-gray-800 ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Comments ({comments.length})
        </h3>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : comments.length === 0 ? (
          <div className="text-center text-gray-500">No comments yet</div>
        ) : (
          comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              isReplying={replyingTo === comment.id}
              replyContent={replyContent}
              onReplyClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              onReplyChange={setReplyContent}
              onReplySubmit={() => handleReply(comment.id)}
              onReaction={(emoji) => handleReaction(comment.id, emoji)}
              onResolve={() => handleResolve(comment.id)}
            />
          ))
        )}
      </div>

      {/* New Comment Input */}
      {currentUser && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm">
              {currentUser.name[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment... (use @name to mention)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 resize-none"
                rows={2}
              />
              <div className="flex justify-end mt-2">
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Comment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Comment Item
// ============================================

interface CommentItemProps {
  comment: Comment;
  isReplying: boolean;
  replyContent: string;
  onReplyClick: () => void;
  onReplyChange: (content: string) => void;
  onReplySubmit: () => void;
  onReaction: (emoji: string) => void;
  onResolve: () => void;
}

function CommentItem({
  comment,
  isReplying,
  replyContent,
  onReplyClick,
  onReplyChange,
  onReplySubmit,
  onReaction,
  onResolve,
}: CommentItemProps) {
  const [showReactions, setShowReactions] = useState(false);
  const emojis = ['👍', '👎', '❤️', '🎉', '😄', '🤔'];

  return (
    <div className={`${comment.resolved ? 'opacity-60' : ''}`}>
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center text-sm">
          {comment.author_name[0].toUpperCase()}
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-gray-900 dark:text-white">
              {comment.author_name}
            </span>
            <span className="text-xs text-gray-500">
              {formatRelativeTime(comment.created_at)}
            </span>
            {comment.resolved && (
              <span className="text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
                Resolved
              </span>
            )}
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {comment.content}
          </p>

          {/* Reactions */}
          {comment.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {groupReactions(comment.reactions).map(({ emoji, count, users }) => (
                <button
                  key={emoji}
                  onClick={() => onReaction(emoji)}
                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
                  title={users.join(', ')}
                >
                  {emoji} {count}
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-2 text-xs">
            <button
              onClick={onReplyClick}
              className="text-gray-500 hover:text-blue-600"
            >
              Reply
            </button>
            <div className="relative">
              <button
                onClick={() => setShowReactions(!showReactions)}
                className="text-gray-500 hover:text-blue-600"
              >
                React
              </button>
              {showReactions && (
                <div className="absolute bottom-full left-0 mb-1 p-1 bg-white dark:bg-gray-700 rounded-lg shadow-lg flex gap-1">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        onReaction(emoji);
                        setShowReactions(false);
                      }}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!comment.resolved && (
              <button
                onClick={onResolve}
                className="text-gray-500 hover:text-green-600"
              >
                Resolve
              </button>
            )}
          </div>

          {/* Reply Input */}
          {isReplying && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={replyContent}
                onChange={(e) => onReplyChange(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                onKeyDown={(e) => e.key === 'Enter' && onReplySubmit()}
              />
              <button
                onClick={onReplySubmit}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Reply
              </button>
            </div>
          )}

          {/* Replies */}
          {comment.replies.length > 0 && (
            <div className="mt-3 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-3">
              {comment.replies.map((reply) => (
                <div key={reply.id} className="flex gap-2">
                  <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center text-xs">
                    {reply.author_name[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {reply.author_name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatRelativeTime(reply.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {reply.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to group reactions
function groupReactions(reactions: { emoji: string; user_name: string }[]) {
  const groups: Record<string, { count: number; users: string[] }> = {};
  for (const r of reactions) {
    if (!groups[r.emoji]) {
      groups[r.emoji] = { count: 0, users: [] };
    }
    groups[r.emoji].count++;
    groups[r.emoji].users.push(r.user_name);
  }
  return Object.entries(groups).map(([emoji, data]) => ({
    emoji,
    ...data,
  }));
}

export default CommentsPanel;
