// Collaboration Commands - Tauri IPC Commands for Collaboration Features
//
// Provides commands for:
// - User management
// - Comments and discussions
// - Reviews
// - Notifications
// - Activity feed

use tauri::State;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::collaboration::{
    CollaborationService, User, Comment, Review, Notification, Activity,
    UserRole, UserStatus, CommentTarget, ReviewTarget, ReviewStatus, ReviewComment,
};

// ============================================
// State Types
// ============================================

pub struct CollabState {
    pub service: CollaborationService,
}

impl CollabState {
    pub fn new() -> Self {
        Self {
            service: CollaborationService::new(),
        }
    }
}

// ============================================
// User Commands
// ============================================

#[tauri::command]
pub async fn collab_add_user(
    state: State<'_, Arc<Mutex<CollabState>>>,
    name: String,
    email: String,
    role: String,
) -> Result<User, String> {
    let mut state = state.lock().await;
    let role = parse_user_role(&role)?;
    Ok(state.service.add_user(&name, &email, role))
}

#[tauri::command]
pub async fn collab_get_user(
    state: State<'_, Arc<Mutex<CollabState>>>,
    user_id: String,
) -> Result<User, String> {
    let state = state.lock().await;
    state.service.get_user(&user_id)
        .cloned()
        .ok_or_else(|| format!("User not found: {}", user_id))
}

#[tauri::command]
pub async fn collab_list_users(
    state: State<'_, Arc<Mutex<CollabState>>>,
) -> Result<Vec<User>, String> {
    let state = state.lock().await;
    Ok(state.service.list_users().into_iter().cloned().collect())
}

#[tauri::command]
pub async fn collab_set_current_user(
    state: State<'_, Arc<Mutex<CollabState>>>,
    user_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.set_current_user(&user_id);
    Ok(())
}

#[tauri::command]
pub async fn collab_update_user_status(
    state: State<'_, Arc<Mutex<CollabState>>>,
    user_id: String,
    status: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let status = parse_user_status(&status)?;
    state.service.update_user_status(&user_id, status)
}

fn parse_user_role(s: &str) -> Result<UserRole, String> {
    match s.to_lowercase().as_str() {
        "owner" => Ok(UserRole::Owner),
        "admin" => Ok(UserRole::Admin),
        "member" => Ok(UserRole::Member),
        "viewer" => Ok(UserRole::Viewer),
        _ => Err(format!("Invalid user role: {}", s)),
    }
}

fn parse_user_status(s: &str) -> Result<UserStatus, String> {
    match s.to_lowercase().as_str() {
        "online" => Ok(UserStatus::Online),
        "away" => Ok(UserStatus::Away),
        "busy" => Ok(UserStatus::Busy),
        "offline" => Ok(UserStatus::Offline),
        _ => Err(format!("Invalid user status: {}", s)),
    }
}

// ============================================
// Comment Commands
// ============================================

#[tauri::command]
pub async fn collab_add_comment(
    state: State<'_, Arc<Mutex<CollabState>>>,
    target_type: String,
    target_id: String,
    content: String,
) -> Result<Comment, String> {
    let mut state = state.lock().await;
    let target_type = parse_comment_target(&target_type)?;
    state.service.add_comment(target_type, &target_id, &content)
}

#[tauri::command]
pub async fn collab_get_comments(
    state: State<'_, Arc<Mutex<CollabState>>>,
    target_type: String,
    target_id: String,
) -> Result<Vec<Comment>, String> {
    let state = state.lock().await;
    let target_type = parse_comment_target(&target_type)?;
    Ok(state.service.get_comments(target_type, &target_id).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn collab_add_reply(
    state: State<'_, Arc<Mutex<CollabState>>>,
    comment_id: String,
    content: String,
) -> Result<Comment, String> {
    let mut state = state.lock().await;
    state.service.add_reply(&comment_id, &content)
}

#[tauri::command]
pub async fn collab_add_reaction(
    state: State<'_, Arc<Mutex<CollabState>>>,
    comment_id: String,
    emoji: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.add_reaction(&comment_id, &emoji)
}

#[tauri::command]
pub async fn collab_resolve_comment(
    state: State<'_, Arc<Mutex<CollabState>>>,
    comment_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.resolve_comment(&comment_id)
}

fn parse_comment_target(s: &str) -> Result<CommentTarget, String> {
    match s.to_lowercase().as_str() {
        "task" => Ok(CommentTarget::Task),
        "spec" => Ok(CommentTarget::Spec),
        "document" => Ok(CommentTarget::Document),
        "project" => Ok(CommentTarget::Project),
        "line" => Ok(CommentTarget::Line),
        _ => Err(format!("Invalid comment target: {}", s)),
    }
}

// ============================================
// Review Commands
// ============================================

#[tauri::command]
pub async fn collab_request_review(
    state: State<'_, Arc<Mutex<CollabState>>>,
    target_type: String,
    target_id: String,
    reviewer_id: String,
) -> Result<Review, String> {
    let mut state = state.lock().await;
    let target_type = parse_review_target(&target_type)?;
    state.service.request_review(target_type, &target_id, &reviewer_id)
}

#[tauri::command]
pub async fn collab_get_review(
    state: State<'_, Arc<Mutex<CollabState>>>,
    review_id: String,
) -> Result<Review, String> {
    let state = state.lock().await;
    state.service.get_review(&review_id)
        .cloned()
        .ok_or_else(|| format!("Review not found: {}", review_id))
}

#[tauri::command]
pub async fn collab_get_pending_reviews(
    state: State<'_, Arc<Mutex<CollabState>>>,
    user_id: String,
) -> Result<Vec<Review>, String> {
    let state = state.lock().await;
    Ok(state.service.get_pending_reviews(&user_id).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn collab_submit_review(
    state: State<'_, Arc<Mutex<CollabState>>>,
    review_id: String,
    status: String,
    comments: Vec<ReviewCommentInput>,
) -> Result<Review, String> {
    let mut state = state.lock().await;
    let status = parse_review_status(&status)?;
    let comments: Vec<ReviewComment> = comments.into_iter().map(|c| ReviewComment {
        id: uuid::Uuid::new_v4().to_string(),
        line_number: c.line_number,
        content: c.content,
        suggestion: c.suggestion,
        resolved: false,
        created_at: chrono::Utc::now().timestamp(),
    }).collect();
    state.service.submit_review(&review_id, status, comments)
}

#[derive(serde::Deserialize)]
pub struct ReviewCommentInput {
    pub line_number: Option<i32>,
    pub content: String,
    pub suggestion: Option<String>,
}

fn parse_review_target(s: &str) -> Result<ReviewTarget, String> {
    match s.to_lowercase().as_str() {
        "spec" => Ok(ReviewTarget::Spec),
        "document" => Ok(ReviewTarget::Document),
        "task" => Ok(ReviewTarget::Task),
        _ => Err(format!("Invalid review target: {}", s)),
    }
}

fn parse_review_status(s: &str) -> Result<ReviewStatus, String> {
    match s.to_lowercase().as_str() {
        "pending" => Ok(ReviewStatus::Pending),
        "in_progress" => Ok(ReviewStatus::InProgress),
        "approved" => Ok(ReviewStatus::Approved),
        "request_changes" => Ok(ReviewStatus::RequestChanges),
        "rejected" => Ok(ReviewStatus::Rejected),
        _ => Err(format!("Invalid review status: {}", s)),
    }
}

// ============================================
// Notification Commands
// ============================================

#[tauri::command]
pub async fn collab_get_notifications(
    state: State<'_, Arc<Mutex<CollabState>>>,
    user_id: String,
    unread_only: bool,
) -> Result<Vec<Notification>, String> {
    let state = state.lock().await;
    Ok(state.service.get_notifications(&user_id, unread_only).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn collab_mark_notification_read(
    state: State<'_, Arc<Mutex<CollabState>>>,
    notification_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.mark_notification_read(&notification_id)
}

#[tauri::command]
pub async fn collab_mark_all_notifications_read(
    state: State<'_, Arc<Mutex<CollabState>>>,
    user_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.service.mark_all_notifications_read(&user_id);
    Ok(())
}

#[tauri::command]
pub async fn collab_get_unread_count(
    state: State<'_, Arc<Mutex<CollabState>>>,
    user_id: String,
) -> Result<usize, String> {
    let state = state.lock().await;
    Ok(state.service.get_unread_count(&user_id))
}

// ============================================
// Activity Commands
// ============================================

#[tauri::command]
pub async fn collab_get_activity_feed(
    state: State<'_, Arc<Mutex<CollabState>>>,
    limit: Option<usize>,
) -> Result<Vec<Activity>, String> {
    let state = state.lock().await;
    Ok(state.service.get_activity_feed(limit.unwrap_or(50)).into_iter().cloned().collect())
}

#[tauri::command]
pub async fn collab_get_user_activity(
    state: State<'_, Arc<Mutex<CollabState>>>,
    user_id: String,
    limit: Option<usize>,
) -> Result<Vec<Activity>, String> {
    let state = state.lock().await;
    Ok(state.service.get_user_activity(&user_id, limit.unwrap_or(50)).into_iter().cloned().collect())
}
