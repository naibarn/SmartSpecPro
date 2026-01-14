// Spec Builder Commands - Tauri IPC Commands for Visual Spec Builder
//
// Provides commands for:
// - Document management
// - Component operations
// - Connection operations
// - Export operations

use tauri::State;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::Mutex;

use crate::spec_builder::{
    SpecBuilder, SpecDocument, Canvas, CanvasComponent, Connection,
    ComponentLibrary, ComponentCategory, ComponentUpdate,
    Anchor, ConnectionType, ConnectionStyle,
};

// ============================================
// State Types
// ============================================

pub struct SpecBuilderState {
    pub builder: SpecBuilder,
    pub documents: HashMap<String, SpecDocument>,
}

impl SpecBuilderState {
    pub fn new() -> Self {
        Self {
            builder: SpecBuilder::new(),
            documents: HashMap::new(),
        }
    }
}

// ============================================
// Library Commands
// ============================================

#[tauri::command]
pub async fn spec_get_library(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
) -> Result<ComponentLibrary, String> {
    let state = state.lock().await;
    Ok(state.builder.library.clone())
}

#[tauri::command]
pub async fn spec_get_categories(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
) -> Result<Vec<ComponentCategory>, String> {
    let state = state.lock().await;
    Ok(state.builder.library.categories.clone())
}

// ============================================
// Document Commands
// ============================================

#[tauri::command]
pub async fn spec_create_document(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    name: String,
    description: Option<String>,
) -> Result<SpecDocument, String> {
    let mut state = state.lock().await;
    let doc = state.builder.create_document(&name, description.as_deref());
    let doc_clone = doc.clone();
    state.documents.insert(doc.id.clone(), doc);
    Ok(doc_clone)
}

#[tauri::command]
pub async fn spec_get_document(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
) -> Result<SpecDocument, String> {
    let state = state.lock().await;
    state.documents.get(&document_id)
        .cloned()
        .ok_or_else(|| format!("Document not found: {}", document_id))
}

#[tauri::command]
pub async fn spec_list_documents(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
) -> Result<Vec<DocumentSummary>, String> {
    let state = state.lock().await;
    Ok(state.documents.values()
        .map(|doc| DocumentSummary {
            id: doc.id.clone(),
            name: doc.name.clone(),
            description: doc.description.clone(),
            status: format!("{:?}", doc.metadata.status),
            component_count: doc.canvas.components.len(),
            updated_at: doc.updated_at,
        })
        .collect())
}

#[derive(serde::Serialize)]
pub struct DocumentSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub component_count: usize,
    pub updated_at: i64,
}

#[tauri::command]
pub async fn spec_save_document(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document: SpecDocument,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let mut doc = document;
    doc.updated_at = chrono::Utc::now().timestamp();
    state.documents.insert(doc.id.clone(), doc);
    Ok(())
}

#[tauri::command]
pub async fn spec_delete_document(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    state.documents.remove(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    Ok(())
}

// ============================================
// Canvas Commands
// ============================================

#[tauri::command]
pub async fn spec_update_canvas(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
    canvas: Canvas,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let doc = state.documents.get_mut(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    doc.canvas = canvas;
    doc.updated_at = chrono::Utc::now().timestamp();
    Ok(())
}

// ============================================
// Component Commands
// ============================================

#[tauri::command]
pub async fn spec_add_component(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
    template_id: String,
    x: f64,
    y: f64,
) -> Result<String, String> {
    let mut state = state.lock().await;
    let doc = state.documents.get_mut(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    let component_id = state.builder.add_component(&mut doc.canvas, &template_id, x, y)?;
    doc.updated_at = chrono::Utc::now().timestamp();
    Ok(component_id)
}

#[tauri::command]
pub async fn spec_update_component(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
    component_id: String,
    updates: ComponentUpdate,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let doc = state.documents.get_mut(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    state.builder.update_component(&mut doc.canvas, &component_id, updates)?;
    doc.updated_at = chrono::Utc::now().timestamp();
    Ok(())
}

#[tauri::command]
pub async fn spec_delete_component(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
    component_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let doc = state.documents.get_mut(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    state.builder.delete_component(&mut doc.canvas, &component_id)?;
    doc.updated_at = chrono::Utc::now().timestamp();
    Ok(())
}

#[tauri::command]
pub async fn spec_duplicate_component(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
    component_id: String,
    offset_x: f64,
    offset_y: f64,
) -> Result<String, String> {
    let mut state = state.lock().await;
    let doc = state.documents.get_mut(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    let component = doc.canvas.components.iter()
        .find(|c| c.id == component_id)
        .ok_or_else(|| format!("Component not found: {}", component_id))?
        .clone();
    
    let mut new_component = component;
    new_component.id = uuid::Uuid::new_v4().to_string();
    new_component.x += offset_x;
    new_component.y += offset_y;
    new_component.z_index = doc.canvas.components.len() as i32;
    
    let new_id = new_component.id.clone();
    doc.canvas.components.push(new_component);
    doc.updated_at = chrono::Utc::now().timestamp();
    
    Ok(new_id)
}

#[tauri::command]
pub async fn spec_move_component_to_front(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
    component_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let doc = state.documents.get_mut(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    let max_z = doc.canvas.components.iter()
        .map(|c| c.z_index)
        .max()
        .unwrap_or(0);
    
    if let Some(component) = doc.canvas.components.iter_mut().find(|c| c.id == component_id) {
        component.z_index = max_z + 1;
    }
    
    doc.updated_at = chrono::Utc::now().timestamp();
    Ok(())
}

#[tauri::command]
pub async fn spec_move_component_to_back(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
    component_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let doc = state.documents.get_mut(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    let min_z = doc.canvas.components.iter()
        .map(|c| c.z_index)
        .min()
        .unwrap_or(0);
    
    if let Some(component) = doc.canvas.components.iter_mut().find(|c| c.id == component_id) {
        component.z_index = min_z - 1;
    }
    
    doc.updated_at = chrono::Utc::now().timestamp();
    Ok(())
}

// ============================================
// Connection Commands
// ============================================

#[tauri::command]
pub async fn spec_add_connection(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
    from_component: String,
    from_anchor: String,
    to_component: String,
    to_anchor: String,
    connection_type: String,
) -> Result<String, String> {
    let mut state = state.lock().await;
    let doc = state.documents.get_mut(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    let from_anchor = parse_anchor(&from_anchor)?;
    let to_anchor = parse_anchor(&to_anchor)?;
    let connection_type = parse_connection_type(&connection_type)?;
    
    let connection_id = state.builder.add_connection(
        &mut doc.canvas,
        &from_component,
        from_anchor,
        &to_component,
        to_anchor,
        connection_type,
    )?;
    
    doc.updated_at = chrono::Utc::now().timestamp();
    Ok(connection_id)
}

#[tauri::command]
pub async fn spec_delete_connection(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
    connection_id: String,
) -> Result<(), String> {
    let mut state = state.lock().await;
    let doc = state.documents.get_mut(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    state.builder.delete_connection(&mut doc.canvas, &connection_id)?;
    doc.updated_at = chrono::Utc::now().timestamp();
    Ok(())
}

fn parse_anchor(s: &str) -> Result<Anchor, String> {
    match s.to_lowercase().as_str() {
        "top" => Ok(Anchor::Top),
        "right" => Ok(Anchor::Right),
        "bottom" => Ok(Anchor::Bottom),
        "left" => Ok(Anchor::Left),
        "center" => Ok(Anchor::Center),
        _ => Err(format!("Invalid anchor: {}", s)),
    }
}

fn parse_connection_type(s: &str) -> Result<ConnectionType, String> {
    match s.to_lowercase().as_str() {
        "arrow" => Ok(ConnectionType::Arrow),
        "line" => Ok(ConnectionType::Line),
        "dashed" => Ok(ConnectionType::Dashed),
        "dependency" => Ok(ConnectionType::Dependency),
        "flow" => Ok(ConnectionType::Flow),
        _ => Err(format!("Invalid connection type: {}", s)),
    }
}

// ============================================
// Export Commands
// ============================================

#[tauri::command]
pub async fn spec_export_markdown(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
) -> Result<String, String> {
    let state = state.lock().await;
    let doc = state.documents.get(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    Ok(state.builder.export_to_markdown(doc))
}

#[tauri::command]
pub async fn spec_export_json(
    state: State<'_, Arc<Mutex<SpecBuilderState>>>,
    document_id: String,
) -> Result<String, String> {
    let state = state.lock().await;
    let doc = state.documents.get(&document_id)
        .ok_or_else(|| format!("Document not found: {}", document_id))?;
    
    state.builder.export_to_json(doc)
}
