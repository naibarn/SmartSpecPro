// Collaboration Service - Team Collaboration Features
//
// Provides:
// - Comments and discussions
// - Review system
// - Notifications
// - Activity feed

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub role: UserRole,
    pub status: UserStatus,
    pub last_seen: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Owner,
    Admin,
    Member,
    Viewer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserStatus {
    Online,
    Away,
    Busy,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    pub id: String,
    pub target_type: CommentTarget,
    pub target_id: String,
    pub author_id: String,
    pub author_name: String,
    pub content: String,
    pub mentions: Vec<String>,
    pub reactions: Vec<Reaction>,
    pub replies: Vec<Comment>,
    pub resolved: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommentTarget {
    Task,
    Spec,
    Document,
    Project,
    Line, // For code/spec line comments
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reaction {
    pub emoji: String,
    pub user_id: String,
    pub user_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Review {
    pub id: String,
    pub target_type: ReviewTarget,
    pub target_id: String,
    pub reviewer_id: String,
    pub reviewer_name: String,
    pub status: ReviewStatus,
    pub comments: Vec<ReviewComment>,
    pub requested_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewTarget {
    Spec,
    Document,
    Task,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewStatus {
    Pending,
    InProgress,
    Approved,
    RequestChanges,
    Rejected,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewComment {
    pub id: String,
    pub line_number: Option<i32>,
    pub content: String,
    pub suggestion: Option<String>,
    pub resolved: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub user_id: String,
    pub notification_type: NotificationType,
    pub title: String,
    pub message: String,
    pub link: Option<String>,
    pub read: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NotificationType {
    Mention,
    Comment,
    ReviewRequest,
    ReviewCompleted,
    TaskAssigned,
    TaskCompleted,
    ProjectUpdate,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Activity {
    pub id: String,
    pub user_id: String,
    pub user_name: String,
    pub activity_type: ActivityType,
    pub target_type: String,
    pub target_id: String,
    pub target_name: String,
    pub description: String,
    pub metadata: HashMap<String, serde_json::Value>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityType {
    Created,
    Updated,
    Deleted,
    Commented,
    Reviewed,
    Assigned,
    Completed,
    Moved,
    Shared,
}

// ============================================
// Collaboration Service
// ============================================

pub struct CollaborationService {
    pub users: HashMap<String, User>,
    pub comments: HashMap<String, Comment>,
    pub reviews: HashMap<String, Review>,
    pub notifications: Vec<Notification>,
    pub activities: Vec<Activity>,
    pub current_user_id: Option<String>,
}

impl CollaborationService {
    pub fn new() -> Self {
        Self {
            users: HashMap::new(),
            comments: HashMap::new(),
            reviews: HashMap::new(),
            notifications: Vec::new(),
            activities: Vec::new(),
            current_user_id: None,
        }
    }

    // ============================================
    // User Operations
    // ============================================

    pub fn set_current_user(&mut self, user_id: &str) {
        self.current_user_id = Some(user_id.to_string());
    }

    pub fn add_user(&mut self, name: &str, email: &str, role: UserRole) -> User {
        let user = User {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            email: email.to_string(),
            avatar_url: None,
            role,
            status: UserStatus::Offline,
            last_seen: chrono::Utc::now().timestamp(),
        };
        self.users.insert(user.id.clone(), user.clone());
        user
    }

    pub fn get_user(&self, user_id: &str) -> Option<&User> {
        self.users.get(user_id)
    }

    pub fn list_users(&self) -> Vec<&User> {
        self.users.values().collect()
    }

    pub fn update_user_status(&mut self, user_id: &str, status: UserStatus) -> Result<(), String> {
        let user = self.users.get_mut(user_id)
            .ok_or_else(|| format!("User not found: {}", user_id))?;
        user.status = status;
        user.last_seen = chrono::Utc::now().timestamp();
        Ok(())
    }

    // ============================================
    // Comment Operations
    // ============================================

    pub fn add_comment(
        &mut self,
        target_type: CommentTarget,
        target_id: &str,
        content: &str,
    ) -> Result<Comment, String> {
        let author_id = self.current_user_id.clone()
            .ok_or("No current user set")?;
        let author = self.users.get(&author_id)
            .ok_or("Current user not found")?;

        // Extract mentions (@username)
        let mentions: Vec<String> = content
            .split_whitespace()
            .filter(|w| w.starts_with('@'))
            .map(|w| w[1..].to_string())
            .collect();

        let now = chrono::Utc::now().timestamp();
        let comment = Comment {
            id: Uuid::new_v4().to_string(),
            target_type,
            target_id: target_id.to_string(),
            author_id: author_id.clone(),
            author_name: author.name.clone(),
            content: content.to_string(),
            mentions: mentions.clone(),
            reactions: Vec::new(),
            replies: Vec::new(),
            resolved: false,
            created_at: now,
            updated_at: now,
        };

        self.comments.insert(comment.id.clone(), comment.clone());

        // Create notifications for mentions
        for mention in mentions {
            if let Some(user) = self.users.values().find(|u| u.name == mention) {
                self.add_notification(
                    &user.id,
                    NotificationType::Mention,
                    "You were mentioned",
                    &format!("{} mentioned you in a comment", author.name),
                    None,
                );
            }
        }

        // Add activity
        self.add_activity(
            &author_id,
            &author.name,
            ActivityType::Commented,
            &format!("{:?}", comment.target_type).to_lowercase(),
            target_id,
            target_id,
            format!("Added a comment"),
        );

        Ok(comment)
    }

    pub fn get_comments(&self, target_type: CommentTarget, target_id: &str) -> Vec<&Comment> {
        self.comments.values()
            .filter(|c| {
                matches!(&c.target_type, t if std::mem::discriminant(t) == std::mem::discriminant(&target_type))
                    && c.target_id == target_id
            })
            .collect()
    }

    pub fn add_reply(&mut self, comment_id: &str, content: &str) -> Result<Comment, String> {
        let author_id = self.current_user_id.clone()
            .ok_or("No current user set")?;
        let author = self.users.get(&author_id)
            .ok_or("Current user not found")?;

        let now = chrono::Utc::now().timestamp();
        let reply = Comment {
            id: Uuid::new_v4().to_string(),
            target_type: CommentTarget::Task, // Will be overwritten
            target_id: comment_id.to_string(),
            author_id: author_id.clone(),
            author_name: author.name.clone(),
            content: content.to_string(),
            mentions: Vec::new(),
            reactions: Vec::new(),
            replies: Vec::new(),
            resolved: false,
            created_at: now,
            updated_at: now,
        };

        let comment = self.comments.get_mut(comment_id)
            .ok_or_else(|| format!("Comment not found: {}", comment_id))?;
        
        let reply_clone = reply.clone();
        comment.replies.push(reply);
        comment.updated_at = now;

        Ok(reply_clone)
    }

    pub fn add_reaction(&mut self, comment_id: &str, emoji: &str) -> Result<(), String> {
        let user_id = self.current_user_id.clone()
            .ok_or("No current user set")?;
        let user = self.users.get(&user_id)
            .ok_or("Current user not found")?;

        let comment = self.comments.get_mut(comment_id)
            .ok_or_else(|| format!("Comment not found: {}", comment_id))?;

        // Remove existing reaction from same user
        comment.reactions.retain(|r| r.user_id != user_id);

        comment.reactions.push(Reaction {
            emoji: emoji.to_string(),
            user_id,
            user_name: user.name.clone(),
        });

        Ok(())
    }

    pub fn resolve_comment(&mut self, comment_id: &str) -> Result<(), String> {
        let comment = self.comments.get_mut(comment_id)
            .ok_or_else(|| format!("Comment not found: {}", comment_id))?;
        comment.resolved = true;
        comment.updated_at = chrono::Utc::now().timestamp();
        Ok(())
    }

    // ============================================
    // Review Operations
    // ============================================

    pub fn request_review(
        &mut self,
        target_type: ReviewTarget,
        target_id: &str,
        reviewer_id: &str,
    ) -> Result<Review, String> {
        let reviewer = self.users.get(reviewer_id)
            .ok_or_else(|| format!("Reviewer not found: {}", reviewer_id))?;

        let review = Review {
            id: Uuid::new_v4().to_string(),
            target_type,
            target_id: target_id.to_string(),
            reviewer_id: reviewer_id.to_string(),
            reviewer_name: reviewer.name.clone(),
            status: ReviewStatus::Pending,
            comments: Vec::new(),
            requested_at: chrono::Utc::now().timestamp(),
            completed_at: None,
        };

        self.reviews.insert(review.id.clone(), review.clone());

        // Notify reviewer
        self.add_notification(
            reviewer_id,
            NotificationType::ReviewRequest,
            "Review requested",
            "You have been requested to review a document",
            None,
        );

        Ok(review)
    }

    pub fn get_review(&self, review_id: &str) -> Option<&Review> {
        self.reviews.get(review_id)
    }

    pub fn get_pending_reviews(&self, user_id: &str) -> Vec<&Review> {
        self.reviews.values()
            .filter(|r| r.reviewer_id == user_id && matches!(r.status, ReviewStatus::Pending | ReviewStatus::InProgress))
            .collect()
    }

    pub fn submit_review(
        &mut self,
        review_id: &str,
        status: ReviewStatus,
        comments: Vec<ReviewComment>,
    ) -> Result<Review, String> {
        let review = self.reviews.get_mut(review_id)
            .ok_or_else(|| format!("Review not found: {}", review_id))?;

        review.status = status;
        review.comments = comments;
        review.completed_at = Some(chrono::Utc::now().timestamp());

        let review_clone = review.clone();

        // Add activity
        if let Some(user_id) = &self.current_user_id {
            if let Some(user) = self.users.get(user_id) {
                self.add_activity(
                    user_id,
                    &user.name,
                    ActivityType::Reviewed,
                    &format!("{:?}", review_clone.target_type).to_lowercase(),
                    &review_clone.target_id,
                    &review_clone.target_id,
                    format!("Completed review with status: {:?}", review_clone.status),
                );
            }
        }

        Ok(review_clone)
    }

    // ============================================
    // Notification Operations
    // ============================================

    pub fn add_notification(
        &mut self,
        user_id: &str,
        notification_type: NotificationType,
        title: &str,
        message: &str,
        link: Option<String>,
    ) -> Notification {
        let notification = Notification {
            id: Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            notification_type,
            title: title.to_string(),
            message: message.to_string(),
            link,
            read: false,
            created_at: chrono::Utc::now().timestamp(),
        };
        self.notifications.push(notification.clone());
        notification
    }

    pub fn get_notifications(&self, user_id: &str, unread_only: bool) -> Vec<&Notification> {
        self.notifications.iter()
            .filter(|n| n.user_id == user_id && (!unread_only || !n.read))
            .collect()
    }

    pub fn mark_notification_read(&mut self, notification_id: &str) -> Result<(), String> {
        let notification = self.notifications.iter_mut()
            .find(|n| n.id == notification_id)
            .ok_or_else(|| format!("Notification not found: {}", notification_id))?;
        notification.read = true;
        Ok(())
    }

    pub fn mark_all_notifications_read(&mut self, user_id: &str) {
        for notification in self.notifications.iter_mut() {
            if notification.user_id == user_id {
                notification.read = true;
            }
        }
    }

    pub fn get_unread_count(&self, user_id: &str) -> usize {
        self.notifications.iter()
            .filter(|n| n.user_id == user_id && !n.read)
            .count()
    }

    // ============================================
    // Activity Operations
    // ============================================

    fn add_activity(
        &mut self,
        user_id: &str,
        user_name: &str,
        activity_type: ActivityType,
        target_type: &str,
        target_id: &str,
        target_name: &str,
        description: String,
    ) {
        let activity = Activity {
            id: Uuid::new_v4().to_string(),
            user_id: user_id.to_string(),
            user_name: user_name.to_string(),
            activity_type,
            target_type: target_type.to_string(),
            target_id: target_id.to_string(),
            target_name: target_name.to_string(),
            description,
            metadata: HashMap::new(),
            timestamp: chrono::Utc::now().timestamp(),
        };
        self.activities.push(activity);
    }

    pub fn get_activity_feed(&self, limit: usize) -> Vec<&Activity> {
        let mut activities: Vec<_> = self.activities.iter().collect();
        activities.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        activities.into_iter().take(limit).collect()
    }

    pub fn get_user_activity(&self, user_id: &str, limit: usize) -> Vec<&Activity> {
        let mut activities: Vec<_> = self.activities.iter()
            .filter(|a| a.user_id == user_id)
            .collect();
        activities.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        activities.into_iter().take(limit).collect()
    }
}
