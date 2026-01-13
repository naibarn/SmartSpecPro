# Sprint 2.4: Collaboration Features

**Duration:** 1.5 สัปดาห์ (7-10 วันทำงาน)  
**Priority:** Medium  
**Dependencies:** Sprint 2.3 (Progress Dashboard)  

---

## 🎯 Sprint Goal

สร้าง Collaboration Features ที่ช่วยให้ทีมสามารถ:
1. พูดคุยและ comment บน tasks และ specs
2. ทำ review workflow สำหรับ specs และ code
3. รับ notifications เมื่อมีการเปลี่ยนแปลง
4. ติดตาม activity ของทีม

---

## 📋 User Stories

### US-2.4.1: Comments & Discussions
> **As a** team member  
> **I want** to comment on tasks and specs  
> **So that** I can communicate with my team

**Acceptance Criteria:**
- [ ] Add comments to tasks
- [ ] Add comments to specs
- [ ] Reply to comments (threaded)
- [ ] Edit/delete own comments
- [ ] Mention team members (@username)
- [ ] Rich text formatting (markdown)

### US-2.4.2: Review Workflow
> **As a** reviewer  
> **I want** to review and approve specs  
> **So that** I can ensure quality before implementation

**Acceptance Criteria:**
- [ ] Request review from team members
- [ ] Review status (pending, approved, rejected, changes requested)
- [ ] Add review comments
- [ ] Approve/reject with comment
- [ ] Track review history

### US-2.4.3: Notifications
> **As a** user  
> **I want** to receive notifications  
> **So that** I stay informed about important updates

**Acceptance Criteria:**
- [ ] In-app notifications
- [ ] Desktop notifications (optional)
- [ ] Notification types (mention, assignment, review, comment)
- [ ] Mark as read/unread
- [ ] Notification settings

### US-2.4.4: Activity Feed
> **As a** team lead  
> **I want** to see all team activity  
> **So that** I can monitor project progress

**Acceptance Criteria:**
- [ ] Chronological activity list
- [ ] Filter by activity type
- [ ] Filter by team member
- [ ] Link to related items
- [ ] Real-time updates

### US-2.4.5: Team Presence
> **As a** team member  
> **I want** to see who is online  
> **So that** I know who is available for collaboration

**Acceptance Criteria:**
- [ ] Online/offline status
- [ ] Current activity indicator
- [ ] Last seen timestamp
- [ ] Status message (optional)

---

## 🏗️ Technical Architecture

### Collaboration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           COLLABORATION SYSTEM                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  COMMENT SYSTEM                                                              │
    │                                                                              │
    │  ┌─────────────────────────────────────────────────────────────────────────┐│
    │  │  Task/Spec                                                              ││
    │  │  ┌───────────────────────────────────────────────────────────────────┐ ││
    │  │  │ Comment Thread                                                     │ ││
    │  │  │ ┌─────────────────────────────────────────────────────────────┐   │ ││
    │  │  │ │ 👤 User A: This looks good, but need to add validation      │   │ ││
    │  │  │ │    └─ 👤 User B: @UserA I'll add it in the next commit      │   │ ││
    │  │  │ │       └─ 👤 User A: 👍                                       │   │ ││
    │  │  │ └─────────────────────────────────────────────────────────────┘   │ ││
    │  │  │ ┌─────────────────────────────────────────────────────────────┐   │ ││
    │  │  │ │ 👤 User C: Can we discuss the API design?                   │   │ ││
    │  │  │ └─────────────────────────────────────────────────────────────┘   │ ││
    │  │  └───────────────────────────────────────────────────────────────────┘ ││
    │  └─────────────────────────────────────────────────────────────────────────┘│
    └──────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  REVIEW WORKFLOW                                                             │
    │                                                                              │
    │  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐            │
    │  │  DRAFT   │ ──► │ PENDING  │ ──► │ REVIEW   │ ──► │ APPROVED │            │
    │  │          │     │ REVIEW   │     │          │     │          │            │
    │  └──────────┘     └──────────┘     └──────────┘     └──────────┘            │
    │                         │                │                                   │
    │                         │                ▼                                   │
    │                         │         ┌──────────┐                               │
    │                         └────────►│ CHANGES  │                               │
    │                                   │ REQUESTED│                               │
    │                                   └──────────┘                               │
    └──────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  NOTIFICATION CENTER                                                         │
    │                                                                              │
    │  ┌─────────────────────────────────────────────────────────────────────────┐│
    │  │ 🔔 Notifications (3 unread)                                             ││
    │  │ ┌───────────────────────────────────────────────────────────────────┐   ││
    │  │ │ 🔵 @you mentioned in "API Design" comment          2 min ago      │   ││
    │  │ │ 🟢 Review approved for "User Auth Spec"            5 min ago      │   ││
    │  │ │ 🟡 Task "Setup DB" assigned to you                10 min ago      │   ││
    │  │ │ ⚪ Comment on "Dashboard" task                     1 hour ago     │   ││
    │  │ └───────────────────────────────────────────────────────────────────┘   ││
    │  └─────────────────────────────────────────────────────────────────────────┘│
    └──────────────────────────────────────────────────────────────────────────────┘
```

### Data Models

```typescript
// Comment model
interface Comment {
  id: string;
  targetType: 'task' | 'spec' | 'review';
  targetId: string;
  parentId?: string; // For threaded replies
  authorId: string;
  content: string; // Markdown
  mentions: string[]; // User IDs
  reactions: Reaction[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

interface Reaction {
  emoji: string;
  userId: string;
}

// Review model
interface Review {
  id: string;
  targetType: 'spec' | 'code';
  targetId: string;
  requesterId: string;
  reviewers: ReviewerStatus[];
  status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'changes_requested';
  comments: string[]; // Comment IDs
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

interface ReviewerStatus {
  userId: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  comment?: string;
  reviewedAt?: Date;
}

// Notification model
interface Notification {
  id: string;
  userId: string;
  type: 'mention' | 'assignment' | 'review_request' | 'review_complete' | 'comment' | 'status_change';
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: Date;
}

// Activity model
interface Activity {
  id: string;
  userId: string;
  type: string;
  targetType: string;
  targetId: string;
  data: Record<string, any>;
  timestamp: Date;
}

// Presence model
interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'busy' | 'offline';
  currentActivity?: string;
  lastSeen: Date;
  statusMessage?: string;
}
```

---

## 📁 Implementation Tasks

### Week 1: Comments & Reviews

#### Task 2.4.1: Collaboration Service (Rust)
**File:** `desktop-app/src-tauri/src/collaboration.rs`

```rust
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: String,
    pub target_type: String,
    pub target_id: String,
    pub parent_id: Option<String>,
    pub author_id: String,
    pub content: String,
    pub mentions: Vec<String>,
    pub reactions: Vec<Reaction>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    pub emoji: String,
    pub user_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Review {
    pub id: String,
    pub target_type: String,
    pub target_id: String,
    pub requester_id: String,
    pub reviewers: Vec<ReviewerStatus>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewerStatus {
    pub user_id: String,
    pub status: String,
    pub comment: Option<String>,
    pub reviewed_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub user_id: String,
    pub notification_type: String,
    pub title: String,
    pub message: String,
    pub link: String,
    pub read: bool,
    pub created_at: DateTime<Utc>,
}

pub struct CollaborationService {
    db: WorkspaceDatabase,
}

impl CollaborationService {
    pub fn new(db: WorkspaceDatabase) -> Self {
        Self { db }
    }
    
    // Comments
    pub fn add_comment(&self, comment: CreateComment) -> Result<Comment, Error> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();
        
        // Parse mentions from content
        let mentions = self.parse_mentions(&comment.content);
        
        let new_comment = Comment {
            id: id.clone(),
            target_type: comment.target_type,
            target_id: comment.target_id,
            parent_id: comment.parent_id,
            author_id: comment.author_id.clone(),
            content: comment.content,
            mentions: mentions.clone(),
            reactions: vec![],
            created_at: now,
            updated_at: now,
            deleted_at: None,
        };
        
        self.db.save_comment(&new_comment)?;
        
        // Create notifications for mentions
        for user_id in &mentions {
            self.create_notification(Notification {
                id: uuid::Uuid::new_v4().to_string(),
                user_id: user_id.clone(),
                notification_type: "mention".to_string(),
                title: "You were mentioned".to_string(),
                message: format!("{} mentioned you in a comment", comment.author_id),
                link: format!("/{}s/{}", new_comment.target_type, new_comment.target_id),
                read: false,
                created_at: now,
            })?;
        }
        
        // Create activity
        self.create_activity(Activity {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: comment.author_id,
            activity_type: "comment_added".to_string(),
            target_type: new_comment.target_type.clone(),
            target_id: new_comment.target_id.clone(),
            data: serde_json::json!({ "comment_id": id }),
            timestamp: now,
        })?;
        
        Ok(new_comment)
    }
    
    fn parse_mentions(&self, content: &str) -> Vec<String> {
        let re = regex::Regex::new(r"@(\w+)").unwrap();
        re.captures_iter(content)
            .filter_map(|cap| cap.get(1).map(|m| m.as_str().to_string()))
            .collect()
    }
    
    pub fn get_comments(&self, target_type: &str, target_id: &str) -> Result<Vec<Comment>, Error> {
        self.db.get_comments_by_target(target_type, target_id)
    }
    
    pub fn update_comment(&self, id: &str, content: &str) -> Result<Comment, Error> {
        let mut comment = self.db.get_comment(id)?;
        comment.content = content.to_string();
        comment.mentions = self.parse_mentions(content);
        comment.updated_at = Utc::now();
        self.db.save_comment(&comment)?;
        Ok(comment)
    }
    
    pub fn delete_comment(&self, id: &str) -> Result<(), Error> {
        let mut comment = self.db.get_comment(id)?;
        comment.deleted_at = Some(Utc::now());
        self.db.save_comment(&comment)?;
        Ok(())
    }
    
    pub fn add_reaction(&self, comment_id: &str, user_id: &str, emoji: &str) -> Result<Comment, Error> {
        let mut comment = self.db.get_comment(comment_id)?;
        
        // Remove existing reaction from same user
        comment.reactions.retain(|r| r.user_id != user_id);
        
        // Add new reaction
        comment.reactions.push(Reaction {
            emoji: emoji.to_string(),
            user_id: user_id.to_string(),
        });
        
        self.db.save_comment(&comment)?;
        Ok(comment)
    }
    
    // Reviews
    pub fn request_review(&self, request: CreateReview) -> Result<Review, Error> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();
        
        let reviewers: Vec<ReviewerStatus> = request.reviewer_ids.iter()
            .map(|user_id| ReviewerStatus {
                user_id: user_id.clone(),
                status: "pending".to_string(),
                comment: None,
                reviewed_at: None,
            })
            .collect();
        
        let review = Review {
            id: id.clone(),
            target_type: request.target_type,
            target_id: request.target_id,
            requester_id: request.requester_id.clone(),
            reviewers: reviewers.clone(),
            status: "pending".to_string(),
            created_at: now,
            updated_at: now,
            completed_at: None,
        };
        
        self.db.save_review(&review)?;
        
        // Notify reviewers
        for reviewer in &reviewers {
            self.create_notification(Notification {
                id: uuid::Uuid::new_v4().to_string(),
                user_id: reviewer.user_id.clone(),
                notification_type: "review_request".to_string(),
                title: "Review requested".to_string(),
                message: format!("{} requested your review", request.requester_id),
                link: format!("/reviews/{}", id),
                read: false,
                created_at: now,
            })?;
        }
        
        Ok(review)
    }
    
    pub fn submit_review(
        &self,
        review_id: &str,
        user_id: &str,
        status: &str,
        comment: Option<&str>,
    ) -> Result<Review, Error> {
        let mut review = self.db.get_review(review_id)?;
        let now = Utc::now();
        
        // Update reviewer status
        for reviewer in &mut review.reviewers {
            if reviewer.user_id == user_id {
                reviewer.status = status.to_string();
                reviewer.comment = comment.map(|s| s.to_string());
                reviewer.reviewed_at = Some(now);
            }
        }
        
        // Calculate overall status
        let all_approved = review.reviewers.iter().all(|r| r.status == "approved");
        let any_rejected = review.reviewers.iter().any(|r| r.status == "rejected");
        let any_changes = review.reviewers.iter().any(|r| r.status == "changes_requested");
        
        review.status = if any_rejected {
            "rejected".to_string()
        } else if any_changes {
            "changes_requested".to_string()
        } else if all_approved {
            review.completed_at = Some(now);
            "approved".to_string()
        } else {
            "in_progress".to_string()
        };
        
        review.updated_at = now;
        self.db.save_review(&review)?;
        
        // Notify requester
        self.create_notification(Notification {
            id: uuid::Uuid::new_v4().to_string(),
            user_id: review.requester_id.clone(),
            notification_type: "review_complete".to_string(),
            title: format!("Review {}", review.status),
            message: format!("{} {} your review", user_id, status),
            link: format!("/reviews/{}", review_id),
            read: false,
            created_at: now,
        })?;
        
        Ok(review)
    }
    
    // Notifications
    pub fn create_notification(&self, notification: Notification) -> Result<(), Error> {
        self.db.save_notification(&notification)?;
        
        // Emit event for real-time update
        // This would be handled by the Tauri event system
        
        Ok(())
    }
    
    pub fn get_notifications(&self, user_id: &str, limit: usize) -> Result<Vec<Notification>, Error> {
        self.db.get_notifications_by_user(user_id, limit)
    }
    
    pub fn mark_notification_read(&self, id: &str) -> Result<(), Error> {
        let mut notification = self.db.get_notification(id)?;
        notification.read = true;
        self.db.save_notification(&notification)?;
        Ok(())
    }
    
    pub fn mark_all_notifications_read(&self, user_id: &str) -> Result<(), Error> {
        self.db.mark_all_notifications_read(user_id)
    }
    
    // Activities
    pub fn create_activity(&self, activity: Activity) -> Result<(), Error> {
        self.db.save_activity(&activity)
    }
    
    pub fn get_activities(&self, limit: usize, filter: Option<ActivityFilter>) -> Result<Vec<Activity>, Error> {
        self.db.get_activities(limit, filter)
    }
}
```

**Deliverables:**
- [ ] Comment CRUD
- [ ] Mention parsing
- [ ] Review workflow
- [ ] Notification system
- [ ] Activity tracking

#### Task 2.4.2: Tauri Commands
**File:** `desktop-app/src-tauri/src/collaboration/commands.rs`

```rust
#[tauri::command]
pub async fn add_comment(
    target_type: String,
    target_id: String,
    content: String,
    parent_id: Option<String>,
    service: State<'_, CollaborationService>,
    user: State<'_, CurrentUser>,
) -> Result<Comment, String> {
    service.add_comment(CreateComment {
        target_type,
        target_id,
        parent_id,
        author_id: user.id.clone(),
        content,
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_comments(
    target_type: String,
    target_id: String,
    service: State<'_, CollaborationService>,
) -> Result<Vec<Comment>, String> {
    service.get_comments(&target_type, &target_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_comment(
    id: String,
    content: String,
    service: State<'_, CollaborationService>,
) -> Result<Comment, String> {
    service.update_comment(&id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_comment(
    id: String,
    service: State<'_, CollaborationService>,
) -> Result<(), String> {
    service.delete_comment(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_reaction(
    comment_id: String,
    emoji: String,
    service: State<'_, CollaborationService>,
    user: State<'_, CurrentUser>,
) -> Result<Comment, String> {
    service.add_reaction(&comment_id, &user.id, &emoji).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn request_review(
    target_type: String,
    target_id: String,
    reviewer_ids: Vec<String>,
    service: State<'_, CollaborationService>,
    user: State<'_, CurrentUser>,
) -> Result<Review, String> {
    service.request_review(CreateReview {
        target_type,
        target_id,
        requester_id: user.id.clone(),
        reviewer_ids,
    }).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn submit_review(
    review_id: String,
    status: String,
    comment: Option<String>,
    service: State<'_, CollaborationService>,
    user: State<'_, CurrentUser>,
) -> Result<Review, String> {
    service.submit_review(&review_id, &user.id, &status, comment.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_notifications(
    limit: usize,
    service: State<'_, CollaborationService>,
    user: State<'_, CurrentUser>,
) -> Result<Vec<Notification>, String> {
    service.get_notifications(&user.id, limit).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mark_notification_read(
    id: String,
    service: State<'_, CollaborationService>,
) -> Result<(), String> {
    service.mark_notification_read(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_activities(
    limit: usize,
    filter: Option<ActivityFilter>,
    service: State<'_, CollaborationService>,
) -> Result<Vec<Activity>, String> {
    service.get_activities(limit, filter).map_err(|e| e.to_string())
}
```

**Deliverables:**
- [ ] Comment commands
- [ ] Review commands
- [ ] Notification commands
- [ ] Activity commands

#### Task 2.4.3: Collaboration Service (TypeScript)
**File:** `desktop-app/src/services/collaborationService.ts`

```typescript
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';

export interface Comment {
  id: string;
  targetType: string;
  targetId: string;
  parentId?: string;
  authorId: string;
  content: string;
  mentions: string[];
  reactions: Reaction[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Reaction {
  emoji: string;
  userId: string;
}

export interface Review {
  id: string;
  targetType: string;
  targetId: string;
  requesterId: string;
  reviewers: ReviewerStatus[];
  status: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface ReviewerStatus {
  userId: string;
  status: string;
  comment?: string;
  reviewedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

class CollaborationService {
  // Comments
  async addComment(
    targetType: string,
    targetId: string,
    content: string,
    parentId?: string
  ): Promise<Comment> {
    return invoke('add_comment', { targetType, targetId, content, parentId });
  }
  
  async getComments(targetType: string, targetId: string): Promise<Comment[]> {
    return invoke('get_comments', { targetType, targetId });
  }
  
  async updateComment(id: string, content: string): Promise<Comment> {
    return invoke('update_comment', { id, content });
  }
  
  async deleteComment(id: string): Promise<void> {
    return invoke('delete_comment', { id });
  }
  
  async addReaction(commentId: string, emoji: string): Promise<Comment> {
    return invoke('add_reaction', { commentId, emoji });
  }
  
  // Reviews
  async requestReview(
    targetType: string,
    targetId: string,
    reviewerIds: string[]
  ): Promise<Review> {
    return invoke('request_review', { targetType, targetId, reviewerIds });
  }
  
  async submitReview(
    reviewId: string,
    status: 'approved' | 'rejected' | 'changes_requested',
    comment?: string
  ): Promise<Review> {
    return invoke('submit_review', { reviewId, status, comment });
  }
  
  async getReview(id: string): Promise<Review> {
    return invoke('get_review', { id });
  }
  
  async getReviewsForTarget(targetType: string, targetId: string): Promise<Review[]> {
    return invoke('get_reviews_for_target', { targetType, targetId });
  }
  
  // Notifications
  async getNotifications(limit: number = 50): Promise<Notification[]> {
    return invoke('get_notifications', { limit });
  }
  
  async markNotificationRead(id: string): Promise<void> {
    return invoke('mark_notification_read', { id });
  }
  
  async markAllNotificationsRead(): Promise<void> {
    return invoke('mark_all_notifications_read');
  }
  
  async getUnreadCount(): Promise<number> {
    return invoke('get_unread_notification_count');
  }
  
  // Real-time subscriptions
  async subscribeToNotifications(callback: (notification: Notification) => void): Promise<() => void> {
    return listen<Notification>('notification:new', (event) => {
      callback(event.payload);
    });
  }
  
  async subscribeToComments(
    targetType: string,
    targetId: string,
    callback: (comment: Comment) => void
  ): Promise<() => void> {
    return listen<Comment>(`comment:${targetType}:${targetId}`, (event) => {
      callback(event.payload);
    });
  }
  
  // Activities
  async getActivities(limit: number = 50, filter?: ActivityFilter): Promise<Activity[]> {
    return invoke('get_activities', { limit, filter });
  }
}

export const collaborationService = new CollaborationService();
```

**Deliverables:**
- [ ] TypeScript service
- [ ] Type definitions
- [ ] Real-time subscriptions

#### Task 2.4.4: Comments Component
**File:** `desktop-app/src/components/collaboration/Comments.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { collaborationService, Comment } from '@/services/collaborationService';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import ReactMarkdown from 'react-markdown';

interface CommentsProps {
  targetType: string;
  targetId: string;
}

export function Comments({ targetType, targetId }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadComments();
    
    // Subscribe to real-time updates
    const unsubscribe = collaborationService.subscribeToComments(
      targetType,
      targetId,
      (comment) => {
        setComments(prev => {
          const exists = prev.some(c => c.id === comment.id);
          if (exists) {
            return prev.map(c => c.id === comment.id ? comment : c);
          }
          return [...prev, comment];
        });
      }
    );
    
    return () => {
      unsubscribe.then(fn => fn());
    };
  }, [targetType, targetId]);
  
  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await collaborationService.getComments(targetType, targetId);
      setComments(data);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    
    await collaborationService.addComment(
      targetType,
      targetId,
      newComment,
      replyTo || undefined
    );
    
    setNewComment('');
    setReplyTo(null);
  };
  
  const handleReaction = async (commentId: string, emoji: string) => {
    await collaborationService.addReaction(commentId, emoji);
  };
  
  // Build comment tree
  const rootComments = comments.filter(c => !c.parentId && !c.deletedAt);
  const getReplies = (parentId: string) => 
    comments.filter(c => c.parentId === parentId && !c.deletedAt);
  
  return (
    <div className="comments-section">
      <h3>Comments ({comments.filter(c => !c.deletedAt).length})</h3>
      
      {/* Comment input */}
      <div className="comment-input">
        {replyTo && (
          <div className="reply-indicator">
            Replying to comment
            <button onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment... (Markdown supported, @mention users)"
          rows={3}
        />
        <div className="input-actions">
          <span className="hint">Markdown supported</span>
          <Button onClick={handleSubmit} disabled={!newComment.trim()}>
            Post Comment
          </Button>
        </div>
      </div>
      
      {/* Comments list */}
      <div className="comments-list">
        {loading ? (
          <LoadingSkeleton />
        ) : rootComments.length === 0 ? (
          <p className="no-comments">No comments yet</p>
        ) : (
          rootComments.map(comment => (
            <CommentThread
              key={comment.id}
              comment={comment}
              replies={getReplies(comment.id)}
              getReplies={getReplies}
              onReply={(id) => setReplyTo(id)}
              onReaction={handleReaction}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface CommentThreadProps {
  comment: Comment;
  replies: Comment[];
  getReplies: (id: string) => Comment[];
  onReply: (id: string) => void;
  onReaction: (id: string, emoji: string) => void;
  depth?: number;
}

function CommentThread({
  comment,
  replies,
  getReplies,
  onReply,
  onReaction,
  depth = 0,
}: CommentThreadProps) {
  const [showReplies, setShowReplies] = useState(true);
  
  return (
    <div className="comment-thread" style={{ marginLeft: depth * 24 }}>
      <div className="comment">
        <Avatar userId={comment.authorId} size="sm" />
        <div className="comment-content">
          <div className="comment-header">
            <span className="author">{comment.authorId}</span>
            <span className="timestamp">
              {new Date(comment.createdAt).toLocaleString()}
            </span>
            {comment.updatedAt !== comment.createdAt && (
              <span className="edited">(edited)</span>
            )}
          </div>
          
          <div className="comment-body">
            <ReactMarkdown>{comment.content}</ReactMarkdown>
          </div>
          
          <div className="comment-actions">
            <button onClick={() => onReply(comment.id)}>Reply</button>
            
            {/* Reactions */}
            <div className="reactions">
              {['👍', '❤️', '🎉', '😄'].map(emoji => {
                const count = comment.reactions.filter(r => r.emoji === emoji).length;
                return (
                  <button
                    key={emoji}
                    className={`reaction ${count > 0 ? 'active' : ''}`}
                    onClick={() => onReaction(comment.id, emoji)}
                  >
                    {emoji} {count > 0 && count}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      
      {/* Replies */}
      {replies.length > 0 && (
        <div className="replies">
          <button
            className="toggle-replies"
            onClick={() => setShowReplies(!showReplies)}
          >
            {showReplies ? '▼' : '▶'} {replies.length} replies
          </button>
          
          {showReplies && replies.map(reply => (
            <CommentThread
              key={reply.id}
              comment={reply}
              replies={getReplies(reply.id)}
              getReplies={getReplies}
              onReply={onReply}
              onReaction={onReaction}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Deliverables:**
- [ ] Comment list
- [ ] Threaded replies
- [ ] Markdown rendering
- [ ] Reactions
- [ ] Real-time updates

---

### Week 1.5: Notifications & Activity

#### Task 2.4.5: Review Panel Component
**File:** `desktop-app/src/components/collaboration/ReviewPanel.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { collaborationService, Review, ReviewerStatus } from '@/services/collaborationService';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Select } from '@/components/ui/select';

interface ReviewPanelProps {
  targetType: string;
  targetId: string;
  onReviewComplete?: (review: Review) => void;
}

export function ReviewPanel({ targetType, targetId, onReviewComplete }: ReviewPanelProps) {
  const [review, setReview] = useState<Review | null>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
  const [reviewComment, setReviewComment] = useState('');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    loadReview();
  }, [targetType, targetId]);
  
  const loadReview = async () => {
    setLoading(true);
    try {
      const reviews = await collaborationService.getReviewsForTarget(targetType, targetId);
      // Get the latest active review
      const activeReview = reviews.find(r => r.status !== 'approved' && r.status !== 'rejected');
      setReview(activeReview || null);
    } finally {
      setLoading(false);
    }
  };
  
  const handleRequestReview = async () => {
    if (selectedReviewers.length === 0) return;
    
    const newReview = await collaborationService.requestReview(
      targetType,
      targetId,
      selectedReviewers
    );
    
    setReview(newReview);
    setShowRequestForm(false);
    setSelectedReviewers([]);
  };
  
  const handleSubmitReview = async (status: 'approved' | 'rejected' | 'changes_requested') => {
    if (!review) return;
    
    const updatedReview = await collaborationService.submitReview(
      review.id,
      status,
      reviewComment || undefined
    );
    
    setReview(updatedReview);
    setReviewComment('');
    
    if (updatedReview.status === 'approved' || updatedReview.status === 'rejected') {
      onReviewComplete?.(updatedReview);
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#10b981';
      case 'rejected': return '#ef4444';
      case 'changes_requested': return '#f59e0b';
      case 'pending': return '#6b7280';
      default: return '#3b82f6';
    }
  };
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return '✓';
      case 'rejected': return '✗';
      case 'changes_requested': return '↻';
      case 'pending': return '○';
      default: return '●';
    }
  };
  
  if (loading) {
    return <LoadingSkeleton />;
  }
  
  return (
    <div className="review-panel">
      <h3>Review</h3>
      
      {!review ? (
        // No active review
        <div className="no-review">
          {showRequestForm ? (
            <div className="request-form">
              <label>Select reviewers:</label>
              <TeamMemberSelect
                value={selectedReviewers}
                onChange={setSelectedReviewers}
                multiple
              />
              <div className="form-actions">
                <Button variant="outline" onClick={() => setShowRequestForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleRequestReview} disabled={selectedReviewers.length === 0}>
                  Request Review
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setShowRequestForm(true)}>
              Request Review
            </Button>
          )}
        </div>
      ) : (
        // Active review
        <div className="active-review">
          <div className="review-status">
            <span
              className="status-badge"
              style={{ backgroundColor: getStatusColor(review.status) }}
            >
              {review.status.replace('_', ' ')}
            </span>
            <span className="requested-by">
              Requested by {review.requesterId}
            </span>
          </div>
          
          {/* Reviewers */}
          <div className="reviewers-list">
            {review.reviewers.map((reviewer) => (
              <div key={reviewer.userId} className="reviewer-item">
                <Avatar userId={reviewer.userId} size="sm" />
                <span className="reviewer-name">{reviewer.userId}</span>
                <span
                  className="reviewer-status"
                  style={{ color: getStatusColor(reviewer.status) }}
                >
                  {getStatusIcon(reviewer.status)} {reviewer.status}
                </span>
                {reviewer.comment && (
                  <p className="reviewer-comment">{reviewer.comment}</p>
                )}
              </div>
            ))}
          </div>
          
          {/* Review form (for current user if they are a reviewer) */}
          {review.reviewers.some(r => r.userId === currentUserId && r.status === 'pending') && (
            <div className="review-form">
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Add a comment (optional)"
                rows={3}
              />
              <div className="review-actions">
                <Button
                  variant="outline"
                  onClick={() => handleSubmitReview('changes_requested')}
                >
                  Request Changes
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleSubmitReview('rejected')}
                >
                  Reject
                </Button>
                <Button
                  variant="success"
                  onClick={() => handleSubmitReview('approved')}
                >
                  Approve
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Deliverables:**
- [ ] Review request form
- [ ] Reviewer list
- [ ] Review submission
- [ ] Status display

#### Task 2.4.6: Notification Center Component
**File:** `desktop-app/src/components/collaboration/NotificationCenter.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { collaborationService, Notification } from '@/services/collaborationService';
import { useNavigate } from 'react-router-dom';

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  
  useEffect(() => {
    loadNotifications();
    
    // Subscribe to new notifications
    const unsubscribe = collaborationService.subscribeToNotifications((notification) => {
      setNotifications(prev => [notification, ...prev]);
      setUnreadCount(prev => prev + 1);
      
      // Show desktop notification if enabled
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
        });
      }
    });
    
    return () => {
      unsubscribe.then(fn => fn());
    };
  }, []);
  
  const loadNotifications = async () => {
    const [data, count] = await Promise.all([
      collaborationService.getNotifications(50),
      collaborationService.getUnreadCount(),
    ]);
    setNotifications(data);
    setUnreadCount(count);
  };
  
  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await collaborationService.markNotificationRead(notification.id);
      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    
    navigate(notification.link);
    setIsOpen(false);
  };
  
  const handleMarkAllRead = async () => {
    await collaborationService.markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };
  
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'mention': return '💬';
      case 'assignment': return '📋';
      case 'review_request': return '👀';
      case 'review_complete': return '✅';
      case 'comment': return '💭';
      case 'status_change': return '🔄';
      default: return '🔔';
    }
  };
  
  return (
    <div className="notification-center">
      <button
        className="notification-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        🔔
        {unreadCount > 0 && (
          <span className="unread-badge">{unreadCount}</span>
        )}
      </button>
      
      {isOpen && (
        <div className="notification-dropdown">
          <div className="dropdown-header">
            <h4>Notifications</h4>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead}>
                Mark all as read
              </button>
            )}
          </div>
          
          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="empty">No notifications</p>
            ) : (
              notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.read ? '' : 'unread'}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <span className="notification-icon">
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="notification-content">
                    <span className="notification-title">{notification.title}</span>
                    <span className="notification-message">{notification.message}</span>
                    <span className="notification-time">
                      {formatTimeAgo(notification.createdAt)}
                    </span>
                  </div>
                  {!notification.read && <span className="unread-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
```

**Deliverables:**
- [ ] Notification dropdown
- [ ] Unread count
- [ ] Mark as read
- [ ] Desktop notifications
- [ ] Navigation to link

#### Task 2.4.7-2.4.10: Additional Tasks

- **2.4.7:** Activity Feed Component
- **2.4.8:** Team Presence Component
- **2.4.9:** Unit Tests
- **2.4.10:** Documentation

---

## 📊 Definition of Done

- [ ] Comments ทำงานได้ (CRUD, threaded, mentions)
- [ ] Reactions ทำงานได้
- [ ] Review workflow ทำงานได้
- [ ] Notifications ทำงานได้
- [ ] Activity feed ทำงานได้
- [ ] Real-time updates ทำงานได้
- [ ] Desktop notifications ทำงานได้
- [ ] Unit tests coverage > 80%

---

## 🎉 Phase 2 Complete!

เมื่อจบ Sprint 2.4 แล้ว Phase 2: Non-Dev Friendly จะเสร็จสมบูรณ์

### Phase 2 Summary

| Sprint | Feature | Duration |
|--------|---------|----------|
| 2.1 | Product Template Wizard | 2 สัปดาห์ |
| 2.2 | Visual Spec Builder | 2 สัปดาห์ |
| 2.3 | Progress Dashboard | 1.5 สัปดาห์ |
| 2.4 | Collaboration Features | 1.5 สัปดาห์ |

**รวม Phase 2:** 7 สัปดาห์

### Next Phase

**Phase 3: Advanced Features**
- Plugin system
- Marketplace
- AI enhancements
- Multi-workspace
- Team management
