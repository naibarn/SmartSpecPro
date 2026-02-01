// Visual Spec Builder - Drag-and-Drop Specification Builder
//
// Provides:
// - Component library management
// - Canvas state management
// - Spec document generation
// - Export to various formats

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// ============================================
// Types
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecDocument {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub version: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub canvas: Canvas,
    pub metadata: SpecMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecMetadata {
    pub author: Option<String>,
    pub project_id: Option<String>,
    pub tags: Vec<String>,
    pub status: SpecStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpecStatus {
    Draft,
    Review,
    Approved,
    Archived,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Canvas {
    pub width: f64,
    pub height: f64,
    pub zoom: f64,
    pub pan_x: f64,
    pub pan_y: f64,
    pub grid_enabled: bool,
    pub snap_to_grid: bool,
    pub grid_size: f64,
    pub components: Vec<CanvasComponent>,
    pub connections: Vec<Connection>,
}

impl Default for Canvas {
    fn default() -> Self {
        Self {
            width: 1920.0,
            height: 1080.0,
            zoom: 1.0,
            pan_x: 0.0,
            pan_y: 0.0,
            grid_enabled: true,
            snap_to_grid: true,
            grid_size: 20.0,
            components: Vec::new(),
            connections: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanvasComponent {
    pub id: String,
    pub component_type: ComponentType,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub z_index: i32,
    pub locked: bool,
    pub visible: bool,
    pub properties: ComponentProperties,
    pub style: ComponentStyle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ComponentType {
    // Structure
    Section,
    Container,
    Card,
    
    // Content
    Heading,
    Paragraph,
    List,
    Table,
    Image,
    
    // Requirements
    UserStory,
    Requirement,
    AcceptanceCriteria,
    
    // Technical
    ApiEndpoint,
    DataModel,
    FlowChart,
    Sequence,
    
    // UI Elements
    Button,
    Input,
    Form,
    Navigation,
    
    // Annotations
    Note,
    Comment,
    Arrow,
    Connector,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentProperties {
    pub title: Option<String>,
    pub content: Option<String>,
    pub items: Option<Vec<String>>,
    pub priority: Option<Priority>,
    pub status: Option<ItemStatus>,
    pub assignee: Option<String>,
    pub due_date: Option<String>,
    pub custom: HashMap<String, serde_json::Value>,
}

impl Default for ComponentProperties {
    fn default() -> Self {
        Self {
            title: None,
            content: None,
            items: None,
            priority: None,
            status: None,
            assignee: None,
            due_date: None,
            custom: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemStatus {
    Todo,
    InProgress,
    Done,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentStyle {
    pub background_color: Option<String>,
    pub border_color: Option<String>,
    pub border_width: Option<f64>,
    pub border_radius: Option<f64>,
    pub text_color: Option<String>,
    pub font_size: Option<f64>,
    pub font_weight: Option<String>,
    pub padding: Option<f64>,
    pub opacity: Option<f64>,
    pub shadow: Option<bool>,
}

impl Default for ComponentStyle {
    fn default() -> Self {
        Self {
            background_color: Some("#ffffff".to_string()),
            border_color: Some("#e5e7eb".to_string()),
            border_width: Some(1.0),
            border_radius: Some(8.0),
            text_color: Some("#1f2937".to_string()),
            font_size: Some(14.0),
            font_weight: Some("normal".to_string()),
            padding: Some(16.0),
            opacity: Some(1.0),
            shadow: Some(false),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub from_component: String,
    pub from_anchor: Anchor,
    pub to_component: String,
    pub to_anchor: Anchor,
    pub connection_type: ConnectionType,
    pub label: Option<String>,
    pub style: ConnectionStyle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Anchor {
    Top,
    Right,
    Bottom,
    Left,
    Center,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionType {
    Arrow,
    Line,
    Dashed,
    Dependency,
    Flow,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStyle {
    pub color: String,
    pub width: f64,
    pub arrow_size: f64,
}

impl Default for ConnectionStyle {
    fn default() -> Self {
        Self {
            color: "#6b7280".to_string(),
            width: 2.0,
            arrow_size: 10.0,
        }
    }
}

// ============================================
// Component Library
// ============================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentLibrary {
    pub categories: Vec<ComponentCategory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentCategory {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub components: Vec<ComponentTemplate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub component_type: ComponentType,
    pub default_width: f64,
    pub default_height: f64,
    pub default_properties: ComponentProperties,
    pub default_style: ComponentStyle,
}

impl ComponentLibrary {
    pub fn default_library() -> Self {
        Self {
            categories: vec![
                ComponentCategory {
                    id: "structure".to_string(),
                    name: "Structure".to_string(),
                    icon: "📐".to_string(),
                    components: vec![
                        ComponentTemplate {
                            id: "section".to_string(),
                            name: "Section".to_string(),
                            description: "A container for grouping related content".to_string(),
                            icon: "📦".to_string(),
                            component_type: ComponentType::Section,
                            default_width: 400.0,
                            default_height: 300.0,
                            default_properties: ComponentProperties {
                                title: Some("Section Title".to_string()),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                background_color: Some("#f9fafb".to_string()),
                                ..Default::default()
                            },
                        },
                        ComponentTemplate {
                            id: "card".to_string(),
                            name: "Card".to_string(),
                            description: "A card container with shadow".to_string(),
                            icon: "🃏".to_string(),
                            component_type: ComponentType::Card,
                            default_width: 300.0,
                            default_height: 200.0,
                            default_properties: ComponentProperties::default(),
                            default_style: ComponentStyle {
                                shadow: Some(true),
                                ..Default::default()
                            },
                        },
                    ],
                },
                ComponentCategory {
                    id: "content".to_string(),
                    name: "Content".to_string(),
                    icon: "📝".to_string(),
                    components: vec![
                        ComponentTemplate {
                            id: "heading".to_string(),
                            name: "Heading".to_string(),
                            description: "A heading text element".to_string(),
                            icon: "🔤".to_string(),
                            component_type: ComponentType::Heading,
                            default_width: 300.0,
                            default_height: 50.0,
                            default_properties: ComponentProperties {
                                content: Some("Heading".to_string()),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                font_size: Some(24.0),
                                font_weight: Some("bold".to_string()),
                                background_color: None,
                                border_width: Some(0.0),
                                ..Default::default()
                            },
                        },
                        ComponentTemplate {
                            id: "paragraph".to_string(),
                            name: "Paragraph".to_string(),
                            description: "A text paragraph".to_string(),
                            icon: "📄".to_string(),
                            component_type: ComponentType::Paragraph,
                            default_width: 400.0,
                            default_height: 100.0,
                            default_properties: ComponentProperties {
                                content: Some("Enter your text here...".to_string()),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                background_color: None,
                                border_width: Some(0.0),
                                ..Default::default()
                            },
                        },
                        ComponentTemplate {
                            id: "list".to_string(),
                            name: "List".to_string(),
                            description: "A bulleted or numbered list".to_string(),
                            icon: "📋".to_string(),
                            component_type: ComponentType::List,
                            default_width: 300.0,
                            default_height: 150.0,
                            default_properties: ComponentProperties {
                                items: Some(vec![
                                    "Item 1".to_string(),
                                    "Item 2".to_string(),
                                    "Item 3".to_string(),
                                ]),
                                ..Default::default()
                            },
                            default_style: ComponentStyle::default(),
                        },
                    ],
                },
                ComponentCategory {
                    id: "requirements".to_string(),
                    name: "Requirements".to_string(),
                    icon: "✅".to_string(),
                    components: vec![
                        ComponentTemplate {
                            id: "user_story".to_string(),
                            name: "User Story".to_string(),
                            description: "As a [user], I want [goal] so that [benefit]".to_string(),
                            icon: "👤".to_string(),
                            component_type: ComponentType::UserStory,
                            default_width: 400.0,
                            default_height: 180.0,
                            default_properties: ComponentProperties {
                                title: Some("User Story".to_string()),
                                content: Some("As a [user type],\nI want [goal],\nSo that [benefit]".to_string()),
                                priority: Some(Priority::Medium),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                background_color: Some("#fef3c7".to_string()),
                                border_color: Some("#f59e0b".to_string()),
                                ..Default::default()
                            },
                        },
                        ComponentTemplate {
                            id: "requirement".to_string(),
                            name: "Requirement".to_string(),
                            description: "A functional or non-functional requirement".to_string(),
                            icon: "📌".to_string(),
                            component_type: ComponentType::Requirement,
                            default_width: 350.0,
                            default_height: 120.0,
                            default_properties: ComponentProperties {
                                title: Some("REQ-001".to_string()),
                                content: Some("Requirement description...".to_string()),
                                priority: Some(Priority::High),
                                status: Some(ItemStatus::Todo),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                background_color: Some("#dbeafe".to_string()),
                                border_color: Some("#3b82f6".to_string()),
                                ..Default::default()
                            },
                        },
                        ComponentTemplate {
                            id: "acceptance_criteria".to_string(),
                            name: "Acceptance Criteria".to_string(),
                            description: "Given-When-Then acceptance criteria".to_string(),
                            icon: "✓".to_string(),
                            component_type: ComponentType::AcceptanceCriteria,
                            default_width: 400.0,
                            default_height: 150.0,
                            default_properties: ComponentProperties {
                                content: Some("Given [context],\nWhen [action],\nThen [outcome]".to_string()),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                background_color: Some("#dcfce7".to_string()),
                                border_color: Some("#22c55e".to_string()),
                                ..Default::default()
                            },
                        },
                    ],
                },
                ComponentCategory {
                    id: "technical".to_string(),
                    name: "Technical".to_string(),
                    icon: "⚙️".to_string(),
                    components: vec![
                        ComponentTemplate {
                            id: "api_endpoint".to_string(),
                            name: "API Endpoint".to_string(),
                            description: "REST API endpoint definition".to_string(),
                            icon: "🔌".to_string(),
                            component_type: ComponentType::ApiEndpoint,
                            default_width: 400.0,
                            default_height: 200.0,
                            default_properties: ComponentProperties {
                                title: Some("GET /api/resource".to_string()),
                                content: Some("Endpoint description...".to_string()),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                background_color: Some("#f3e8ff".to_string()),
                                border_color: Some("#a855f7".to_string()),
                                ..Default::default()
                            },
                        },
                        ComponentTemplate {
                            id: "data_model".to_string(),
                            name: "Data Model".to_string(),
                            description: "Database entity or data structure".to_string(),
                            icon: "🗃️".to_string(),
                            component_type: ComponentType::DataModel,
                            default_width: 300.0,
                            default_height: 250.0,
                            default_properties: ComponentProperties {
                                title: Some("Entity".to_string()),
                                items: Some(vec![
                                    "id: string".to_string(),
                                    "name: string".to_string(),
                                    "created_at: datetime".to_string(),
                                ]),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                background_color: Some("#fce7f3".to_string()),
                                border_color: Some("#ec4899".to_string()),
                                ..Default::default()
                            },
                        },
                    ],
                },
                ComponentCategory {
                    id: "annotations".to_string(),
                    name: "Annotations".to_string(),
                    icon: "💬".to_string(),
                    components: vec![
                        ComponentTemplate {
                            id: "note".to_string(),
                            name: "Note".to_string(),
                            description: "A sticky note for annotations".to_string(),
                            icon: "📝".to_string(),
                            component_type: ComponentType::Note,
                            default_width: 200.0,
                            default_height: 150.0,
                            default_properties: ComponentProperties {
                                content: Some("Note...".to_string()),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                background_color: Some("#fef08a".to_string()),
                                border_color: Some("#eab308".to_string()),
                                ..Default::default()
                            },
                        },
                        ComponentTemplate {
                            id: "comment".to_string(),
                            name: "Comment".to_string(),
                            description: "A comment or feedback".to_string(),
                            icon: "💬".to_string(),
                            component_type: ComponentType::Comment,
                            default_width: 250.0,
                            default_height: 100.0,
                            default_properties: ComponentProperties {
                                content: Some("Comment...".to_string()),
                                ..Default::default()
                            },
                            default_style: ComponentStyle {
                                background_color: Some("#e0e7ff".to_string()),
                                border_color: Some("#6366f1".to_string()),
                                ..Default::default()
                            },
                        },
                    ],
                },
            ],
        }
    }
}

// ============================================
// Spec Builder
// ============================================

pub struct SpecBuilder {
    pub library: ComponentLibrary,
}

impl SpecBuilder {
    pub fn new() -> Self {
        Self {
            library: ComponentLibrary::default_library(),
        }
    }

    // ============================================
    // Document Operations
    // ============================================

    pub fn create_document(&self, name: &str, description: Option<&str>) -> SpecDocument {
        let now = chrono::Utc::now().timestamp();
        SpecDocument {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            description: description.map(|s| s.to_string()),
            version: "1.0.0".to_string(),
            created_at: now,
            updated_at: now,
            canvas: Canvas::default(),
            metadata: SpecMetadata {
                author: None,
                project_id: None,
                tags: Vec::new(),
                status: SpecStatus::Draft,
            },
        }
    }

    // ============================================
    // Component Operations
    // ============================================

    pub fn add_component(
        &self,
        canvas: &mut Canvas,
        template_id: &str,
        x: f64,
        y: f64,
    ) -> Result<String, String> {
        let template = self.find_template(template_id)
            .ok_or_else(|| format!("Template not found: {}", template_id))?;

        let (x, y) = if canvas.snap_to_grid {
            (
                (x / canvas.grid_size).round() * canvas.grid_size,
                (y / canvas.grid_size).round() * canvas.grid_size,
            )
        } else {
            (x, y)
        };

        let component = CanvasComponent {
            id: Uuid::new_v4().to_string(),
            component_type: template.component_type.clone(),
            x,
            y,
            width: template.default_width,
            height: template.default_height,
            rotation: 0.0,
            z_index: canvas.components.len() as i32,
            locked: false,
            visible: true,
            properties: template.default_properties.clone(),
            style: template.default_style.clone(),
        };

        let id = component.id.clone();
        canvas.components.push(component);
        Ok(id)
    }

    fn find_template(&self, template_id: &str) -> Option<&ComponentTemplate> {
        for category in &self.library.categories {
            for template in &category.components {
                if template.id == template_id {
                    return Some(template);
                }
            }
        }
        None
    }

    pub fn update_component(
        &self,
        canvas: &mut Canvas,
        component_id: &str,
        updates: ComponentUpdate,
    ) -> Result<(), String> {
        let component = canvas.components.iter_mut()
            .find(|c| c.id == component_id)
            .ok_or_else(|| format!("Component not found: {}", component_id))?;

        if let Some(x) = updates.x {
            component.x = if canvas.snap_to_grid {
                (x / canvas.grid_size).round() * canvas.grid_size
            } else {
                x
            };
        }
        if let Some(y) = updates.y {
            component.y = if canvas.snap_to_grid {
                (y / canvas.grid_size).round() * canvas.grid_size
            } else {
                y
            };
        }
        if let Some(width) = updates.width {
            component.width = width;
        }
        if let Some(height) = updates.height {
            component.height = height;
        }
        if let Some(rotation) = updates.rotation {
            component.rotation = rotation;
        }
        if let Some(locked) = updates.locked {
            component.locked = locked;
        }
        if let Some(visible) = updates.visible {
            component.visible = visible;
        }
        if let Some(properties) = updates.properties {
            component.properties = properties;
        }
        if let Some(style) = updates.style {
            component.style = style;
        }

        Ok(())
    }

    pub fn delete_component(&self, canvas: &mut Canvas, component_id: &str) -> Result<(), String> {
        let index = canvas.components.iter()
            .position(|c| c.id == component_id)
            .ok_or_else(|| format!("Component not found: {}", component_id))?;

        canvas.components.remove(index);

        // Remove related connections
        canvas.connections.retain(|c| {
            c.from_component != component_id && c.to_component != component_id
        });

        Ok(())
    }

    // ============================================
    // Connection Operations
    // ============================================

    pub fn add_connection(
        &self,
        canvas: &mut Canvas,
        from_component: &str,
        from_anchor: Anchor,
        to_component: &str,
        to_anchor: Anchor,
        connection_type: ConnectionType,
    ) -> Result<String, String> {
        // Verify components exist
        if !canvas.components.iter().any(|c| c.id == from_component) {
            return Err(format!("Source component not found: {}", from_component));
        }
        if !canvas.components.iter().any(|c| c.id == to_component) {
            return Err(format!("Target component not found: {}", to_component));
        }

        let connection = Connection {
            id: Uuid::new_v4().to_string(),
            from_component: from_component.to_string(),
            from_anchor,
            to_component: to_component.to_string(),
            to_anchor,
            connection_type,
            label: None,
            style: ConnectionStyle::default(),
        };

        let id = connection.id.clone();
        canvas.connections.push(connection);
        Ok(id)
    }

    pub fn delete_connection(&self, canvas: &mut Canvas, connection_id: &str) -> Result<(), String> {
        let index = canvas.connections.iter()
            .position(|c| c.id == connection_id)
            .ok_or_else(|| format!("Connection not found: {}", connection_id))?;

        canvas.connections.remove(index);
        Ok(())
    }

    // ============================================
    // Export Operations
    // ============================================

    pub fn export_to_markdown(&self, doc: &SpecDocument) -> String {
        let mut md = String::new();

        // Header
        md.push_str(&format!("# {}\n\n", doc.name));
        if let Some(desc) = &doc.description {
            md.push_str(&format!("{}\n\n", desc));
        }

        // Group components by type
        let mut sections: HashMap<String, Vec<&CanvasComponent>> = HashMap::new();
        for component in &doc.canvas.components {
            let type_name = format!("{:?}", component.component_type);
            sections.entry(type_name).or_default().push(component);
        }

        // Output each section
        for (type_name, components) in sections {
            md.push_str(&format!("## {}\n\n", type_name));
            for component in components {
                if let Some(title) = &component.properties.title {
                    md.push_str(&format!("### {}\n\n", title));
                }
                if let Some(content) = &component.properties.content {
                    md.push_str(&format!("{}\n\n", content));
                }
                if let Some(items) = &component.properties.items {
                    for item in items {
                        md.push_str(&format!("- {}\n", item));
                    }
                    md.push('\n');
                }
            }
        }

        md
    }

    pub fn export_to_json(&self, doc: &SpecDocument) -> Result<String, String> {
        serde_json::to_string_pretty(doc)
            .map_err(|e| format!("Failed to serialize: {}", e))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComponentUpdate {
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub rotation: Option<f64>,
    pub locked: Option<bool>,
    pub visible: Option<bool>,
    pub properties: Option<ComponentProperties>,
    pub style: Option<ComponentStyle>,
}
