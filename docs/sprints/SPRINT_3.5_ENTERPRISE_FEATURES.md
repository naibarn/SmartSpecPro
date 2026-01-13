# Sprint 3.5: Enterprise Features

**Duration:** 2 สัปดาห์ (10-14 วันทำงาน)  
**Priority:** High  
**Dependencies:** Sprint 3.4 (Multi-workspace)  

---

## 🎯 Sprint Goal

สร้าง Enterprise Features ที่ช่วยให้:
1. Single Sign-On (SSO) ด้วย SAML และ OIDC
2. Audit logging สำหรับ compliance
3. Role-Based Access Control (RBAC)
4. Compliance reports (GDPR, SOC2)
5. Backup และ restore

---

## 📋 User Stories

### US-3.5.1: Single Sign-On
> **As an** IT admin  
> **I want** to configure SSO for my organization  
> **So that** users can login with corporate credentials

**Acceptance Criteria:**
- [ ] SAML 2.0 support
- [ ] OIDC support
- [ ] Multiple IdP support
- [ ] Auto-provisioning
- [ ] Group mapping

### US-3.5.2: Audit Logging
> **As a** compliance officer  
> **I want** to view audit logs of all actions  
> **So that** I can ensure compliance

**Acceptance Criteria:**
- [ ] Action logging
- [ ] User tracking
- [ ] Export logs
- [ ] Search and filter
- [ ] Retention policies

### US-3.5.3: Role-Based Access Control
> **As an** admin  
> **I want** to define custom roles and permissions  
> **So that** I can control access granularly

**Acceptance Criteria:**
- [ ] Custom roles
- [ ] Permission sets
- [ ] Role assignment
- [ ] Permission inheritance
- [ ] Audit trail

### US-3.5.4: Compliance Reports
> **As a** compliance officer  
> **I want** to generate compliance reports  
> **So that** I can demonstrate compliance

**Acceptance Criteria:**
- [ ] GDPR report
- [ ] SOC2 report
- [ ] Data inventory
- [ ] Access reports
- [ ] Scheduled reports

### US-3.5.5: Backup & Restore
> **As an** admin  
> **I want** to backup and restore data  
> **So that** I can protect against data loss

**Acceptance Criteria:**
- [ ] Automated backups
- [ ] Manual backups
- [ ] Point-in-time restore
- [ ] Selective restore
- [ ] Backup verification

---

## 🏗️ Technical Architecture

### Enterprise Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           ENTERPRISE ARCHITECTURE                                │
└─────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  IDENTITY & ACCESS                                                           │
    │                                                                              │
    │  ┌───────────────────────────────────────────────────────────────────────┐  │
    │  │  SSO Provider                                                         │  │
    │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐             │  │
    │  │  │    SAML       │  │    OIDC       │  │   OAuth 2.0   │             │  │
    │  │  │               │  │               │  │               │             │  │
    │  │  │ • Okta        │  │ • Auth0       │  │ • Google      │             │  │
    │  │  │ • Azure AD    │  │ • Keycloak    │  │ • GitHub      │             │  │
    │  │  │ • OneLogin    │  │ • Ping        │  │ • Microsoft   │             │  │
    │  │  └───────────────┘  └───────────────┘  └───────────────┘             │  │
    │  └───────────────────────────────────────────────────────────────────────┘  │
    │                                      │                                       │
    │                                      ▼                                       │
    │  ┌───────────────────────────────────────────────────────────────────────┐  │
    │  │  RBAC Engine                                                          │  │
    │  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐             │  │
    │  │  │    Roles      │  │  Permissions  │  │   Policies    │             │  │
    │  │  │               │  │               │  │               │             │  │
    │  │  │ • Admin       │  │ • Read        │  │ • Allow       │             │  │
    │  │  │ • Manager     │  │ • Write       │  │ • Deny        │             │  │
    │  │  │ • Developer   │  │ • Delete      │  │ • Conditional │             │  │
    │  │  │ • Viewer      │  │ • Admin       │  │               │             │  │
    │  │  └───────────────┘  └───────────────┘  └───────────────┘             │  │
    │  └───────────────────────────────────────────────────────────────────────┘  │
    └──────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  AUDIT & COMPLIANCE                                                          │
    │                                                                              │
    │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
    │  │  Audit Log    │  │  Compliance   │  │  Data         │  │  Reports      │ │
    │  │               │  │  Engine       │  │  Governance   │  │               │ │
    │  │ • Actions     │  │               │  │               │  │ • GDPR        │ │
    │  │ • Users       │  │ • GDPR        │  │ • Retention   │  │ • SOC2        │ │
    │  │ • Resources   │  │ • SOC2        │  │ • Encryption  │  │ • HIPAA       │ │
    │  │ • Timestamps  │  │ • HIPAA       │  │ • Masking     │  │ • Custom      │ │
    │  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
    └──────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │  DATA PROTECTION                                                             │
    │                                                                              │
    │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
    │  │  Backup       │  │  Encryption   │  │  Recovery     │  │  Monitoring   │ │
    │  │               │  │               │  │               │  │               │ │
    │  │ • Scheduled   │  │ • At rest     │  │ • Full        │  │ • Health      │ │
    │  │ • On-demand   │  │ • In transit  │  │ • Point-in-   │  │ • Alerts      │ │
    │  │ • Incremental │  │ • Key mgmt    │  │   time        │  │ • Metrics     │ │
    │  │               │  │               │  │ • Selective   │  │               │ │
    │  └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
    └──────────────────────────────────────────────────────────────────────────────┘
```

### Data Models

```typescript
// SSO Configuration
interface SSOConfig {
  id: string;
  organizationId: string;
  provider: 'saml' | 'oidc' | 'oauth2';
  name: string;
  enabled: boolean;
  config: SAMLConfig | OIDCConfig | OAuth2Config;
  groupMapping: GroupMapping[];
  autoProvisioning: boolean;
  defaultRole: string;
  createdAt: string;
  updatedAt: string;
}

interface SAMLConfig {
  entityId: string;
  ssoUrl: string;
  certificate: string;
  signatureAlgorithm: string;
  nameIdFormat: string;
  attributeMapping: Record<string, string>;
}

interface OIDCConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  claimMapping: Record<string, string>;
}

// Audit Log Entry
interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  resource: {
    type: string;
    id: string;
    name: string;
  };
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  status: 'success' | 'failure';
  errorMessage?: string;
}

// Role Definition
interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Permission {
  resource: string;
  actions: ('create' | 'read' | 'update' | 'delete' | 'admin')[];
  conditions?: PermissionCondition[];
}

// Backup
interface Backup {
  id: string;
  organizationId: string;
  type: 'full' | 'incremental';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  size: number;
  location: string;
  encryptionKey: string;
  createdAt: string;
  completedAt?: string;
  expiresAt: string;
  metadata: {
    workspaces: number;
    users: number;
    tasks: number;
  };
}
```

---

## 📁 Implementation Tasks

### Week 1: SSO & RBAC

#### Task 3.5.1: SSO Provider (Rust)
**File:** `desktop-app/src-tauri/src/enterprise/sso.rs`

```rust
use async_trait::async_trait;
use std::sync::Arc;

pub mod saml;
pub mod oidc;
pub mod oauth2;

pub struct SSOManager {
    providers: HashMap<String, Arc<dyn SSOProvider>>,
    configs: Arc<RwLock<HashMap<String, SSOConfig>>>,
}

impl SSOManager {
    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
            configs: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    pub async fn configure_sso(&self, config: SSOConfig) -> Result<(), Error> {
        // Validate config
        self.validate_config(&config)?;
        
        // Create provider
        let provider: Arc<dyn SSOProvider> = match config.provider {
            SSOProviderType::SAML => Arc::new(SAMLProvider::new(&config)?),
            SSOProviderType::OIDC => Arc::new(OIDCProvider::new(&config)?),
            SSOProviderType::OAuth2 => Arc::new(OAuth2Provider::new(&config)?),
        };
        
        // Test connection
        provider.test_connection().await?;
        
        // Store config
        let mut configs = self.configs.write().await;
        configs.insert(config.id.clone(), config.clone());
        
        // Register provider
        self.providers.insert(config.id.clone(), provider);
        
        Ok(())
    }
    
    pub async fn initiate_login(&self, config_id: &str) -> Result<LoginInitiation, Error> {
        let provider = self.providers.get(config_id).ok_or(Error::ProviderNotFound)?;
        provider.initiate_login().await
    }
    
    pub async fn handle_callback(&self, config_id: &str, callback: CallbackData) -> Result<SSOUser, Error> {
        let provider = self.providers.get(config_id).ok_or(Error::ProviderNotFound)?;
        let config = self.configs.read().await.get(config_id).cloned().ok_or(Error::ConfigNotFound)?;
        
        // Validate callback
        let user_info = provider.handle_callback(callback).await?;
        
        // Map attributes
        let mapped_user = self.map_user_attributes(&user_info, &config)?;
        
        // Auto-provision if enabled
        if config.auto_provisioning {
            self.provision_user(&mapped_user, &config).await?;
        }
        
        // Map groups to roles
        let roles = self.map_groups_to_roles(&mapped_user.groups, &config.group_mapping)?;
        
        Ok(SSOUser {
            id: mapped_user.id,
            email: mapped_user.email,
            name: mapped_user.name,
            roles,
            provider: config_id.to_string(),
        })
    }
    
    fn map_user_attributes(&self, user_info: &ProviderUserInfo, config: &SSOConfig) -> Result<MappedUser, Error> {
        let attribute_mapping = match &config.config {
            SSOConfigType::SAML(c) => &c.attribute_mapping,
            SSOConfigType::OIDC(c) => &c.claim_mapping,
            SSOConfigType::OAuth2(c) => &c.attribute_mapping,
        };
        
        Ok(MappedUser {
            id: user_info.get_attribute(attribute_mapping.get("id").unwrap_or(&"sub".to_string()))?,
            email: user_info.get_attribute(attribute_mapping.get("email").unwrap_or(&"email".to_string()))?,
            name: user_info.get_attribute(attribute_mapping.get("name").unwrap_or(&"name".to_string()))?,
            groups: user_info.get_groups()?,
        })
    }
    
    fn map_groups_to_roles(&self, groups: &[String], mapping: &[GroupMapping]) -> Result<Vec<String>, Error> {
        let mut roles = Vec::new();
        
        for group in groups {
            for m in mapping {
                if m.group == *group || m.group_pattern.as_ref().map(|p| group.contains(p)).unwrap_or(false) {
                    roles.push(m.role.clone());
                }
            }
        }
        
        Ok(roles)
    }
}

#[async_trait]
trait SSOProvider: Send + Sync {
    async fn test_connection(&self) -> Result<(), Error>;
    async fn initiate_login(&self) -> Result<LoginInitiation, Error>;
    async fn handle_callback(&self, callback: CallbackData) -> Result<ProviderUserInfo, Error>;
}

// SAML Provider
pub struct SAMLProvider {
    config: SAMLConfig,
}

impl SAMLProvider {
    pub fn new(config: &SSOConfig) -> Result<Self, Error> {
        let saml_config = match &config.config {
            SSOConfigType::SAML(c) => c.clone(),
            _ => return Err(Error::InvalidConfig),
        };
        
        Ok(Self { config: saml_config })
    }
}

#[async_trait]
impl SSOProvider for SAMLProvider {
    async fn test_connection(&self) -> Result<(), Error> {
        // Fetch and validate IdP metadata
        Ok(())
    }
    
    async fn initiate_login(&self) -> Result<LoginInitiation, Error> {
        // Generate SAML AuthnRequest
        let request = self.generate_authn_request()?;
        
        Ok(LoginInitiation {
            redirect_url: format!("{}?SAMLRequest={}", self.config.sso_url, urlencoding::encode(&request)),
            state: None,
        })
    }
    
    async fn handle_callback(&self, callback: CallbackData) -> Result<ProviderUserInfo, Error> {
        // Parse and validate SAML Response
        let response = self.parse_saml_response(&callback.saml_response.ok_or(Error::MissingResponse)?)?;
        
        // Validate signature
        self.validate_signature(&response)?;
        
        // Extract user info
        let user_info = self.extract_user_info(&response)?;
        
        Ok(user_info)
    }
}

// OIDC Provider
pub struct OIDCProvider {
    config: OIDCConfig,
    client: reqwest::Client,
}

#[async_trait]
impl SSOProvider for OIDCProvider {
    async fn test_connection(&self) -> Result<(), Error> {
        // Fetch OIDC discovery document
        let discovery_url = format!("{}/.well-known/openid-configuration", self.config.issuer);
        self.client.get(&discovery_url).send().await?;
        Ok(())
    }
    
    async fn initiate_login(&self) -> Result<LoginInitiation, Error> {
        let state = uuid::Uuid::new_v4().to_string();
        let nonce = uuid::Uuid::new_v4().to_string();
        
        let redirect_url = format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&state={}&nonce={}",
            self.config.authorization_endpoint,
            self.config.client_id,
            urlencoding::encode(&self.get_callback_url()),
            urlencoding::encode(&self.config.scopes.join(" ")),
            state,
            nonce,
        );
        
        Ok(LoginInitiation {
            redirect_url,
            state: Some(state),
        })
    }
    
    async fn handle_callback(&self, callback: CallbackData) -> Result<ProviderUserInfo, Error> {
        let code = callback.code.ok_or(Error::MissingCode)?;
        
        // Exchange code for tokens
        let tokens = self.exchange_code(&code).await?;
        
        // Validate ID token
        let claims = self.validate_id_token(&tokens.id_token)?;
        
        // Get user info
        let user_info = self.get_user_info(&tokens.access_token).await?;
        
        Ok(user_info)
    }
}
```

**Deliverables:**
- [ ] SAML provider
- [ ] OIDC provider
- [ ] OAuth2 provider
- [ ] User provisioning
- [ ] Group mapping

#### Task 3.5.2: RBAC Engine
**File:** `desktop-app/src-tauri/src/enterprise/rbac.rs`

```rust
pub struct RBACEngine {
    roles: Arc<RwLock<HashMap<String, Role>>>,
    user_roles: Arc<RwLock<HashMap<String, Vec<String>>>>,
    policies: Arc<RwLock<Vec<Policy>>>,
}

impl RBACEngine {
    pub fn new() -> Self {
        let mut engine = Self {
            roles: Arc::new(RwLock::new(HashMap::new())),
            user_roles: Arc::new(RwLock::new(HashMap::new())),
            policies: Arc::new(RwLock::new(Vec::new())),
        };
        
        // Initialize system roles
        engine.initialize_system_roles();
        
        engine
    }
    
    fn initialize_system_roles(&mut self) {
        let system_roles = vec![
            Role {
                id: "admin".to_string(),
                name: "Administrator".to_string(),
                description: "Full access to all resources".to_string(),
                permissions: vec![
                    Permission {
                        resource: "*".to_string(),
                        actions: vec![Action::Create, Action::Read, Action::Update, Action::Delete, Action::Admin],
                        conditions: None,
                    },
                ],
                is_system: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            Role {
                id: "manager".to_string(),
                name: "Manager".to_string(),
                description: "Manage workspaces and users".to_string(),
                permissions: vec![
                    Permission {
                        resource: "workspace".to_string(),
                        actions: vec![Action::Create, Action::Read, Action::Update, Action::Delete],
                        conditions: None,
                    },
                    Permission {
                        resource: "user".to_string(),
                        actions: vec![Action::Read, Action::Update],
                        conditions: None,
                    },
                ],
                is_system: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            Role {
                id: "developer".to_string(),
                name: "Developer".to_string(),
                description: "Work on tasks and specs".to_string(),
                permissions: vec![
                    Permission {
                        resource: "task".to_string(),
                        actions: vec![Action::Create, Action::Read, Action::Update],
                        conditions: None,
                    },
                    Permission {
                        resource: "spec".to_string(),
                        actions: vec![Action::Create, Action::Read, Action::Update],
                        conditions: None,
                    },
                ],
                is_system: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            Role {
                id: "viewer".to_string(),
                name: "Viewer".to_string(),
                description: "Read-only access".to_string(),
                permissions: vec![
                    Permission {
                        resource: "*".to_string(),
                        actions: vec![Action::Read],
                        conditions: None,
                    },
                ],
                is_system: true,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
        ];
        
        let mut roles = self.roles.blocking_write();
        for role in system_roles {
            roles.insert(role.id.clone(), role);
        }
    }
    
    pub async fn check_permission(&self, user_id: &str, resource: &str, action: Action) -> Result<bool, Error> {
        let user_roles = self.user_roles.read().await;
        let role_ids = user_roles.get(user_id).cloned().unwrap_or_default();
        
        let roles = self.roles.read().await;
        
        for role_id in role_ids {
            if let Some(role) = roles.get(&role_id) {
                for permission in &role.permissions {
                    if self.matches_resource(&permission.resource, resource) {
                        if permission.actions.contains(&action) || permission.actions.contains(&Action::Admin) {
                            // Check conditions
                            if let Some(conditions) = &permission.conditions {
                                if !self.evaluate_conditions(conditions, user_id, resource).await? {
                                    continue;
                                }
                            }
                            return Ok(true);
                        }
                    }
                }
            }
        }
        
        // Check policies
        let policies = self.policies.read().await;
        for policy in policies.iter() {
            if self.matches_policy(policy, user_id, resource, &action).await? {
                return Ok(policy.effect == PolicyEffect::Allow);
            }
        }
        
        Ok(false)
    }
    
    fn matches_resource(&self, pattern: &str, resource: &str) -> bool {
        if pattern == "*" {
            return true;
        }
        
        if pattern.ends_with("*") {
            let prefix = &pattern[..pattern.len() - 1];
            return resource.starts_with(prefix);
        }
        
        pattern == resource
    }
    
    async fn evaluate_conditions(&self, conditions: &[PermissionCondition], user_id: &str, resource: &str) -> Result<bool, Error> {
        for condition in conditions {
            match condition {
                PermissionCondition::OwnerOnly => {
                    let owner = self.get_resource_owner(resource).await?;
                    if owner != user_id {
                        return Ok(false);
                    }
                }
                PermissionCondition::WorkspaceMember(workspace_id) => {
                    if !self.is_workspace_member(user_id, workspace_id).await? {
                        return Ok(false);
                    }
                }
                PermissionCondition::TimeRange { start, end } => {
                    let now = chrono::Utc::now();
                    if now < *start || now > *end {
                        return Ok(false);
                    }
                }
            }
        }
        
        Ok(true)
    }
    
    pub async fn create_role(&self, role: Role) -> Result<Role, Error> {
        if role.is_system {
            return Err(Error::CannotCreateSystemRole);
        }
        
        let mut roles = self.roles.write().await;
        roles.insert(role.id.clone(), role.clone());
        
        Ok(role)
    }
    
    pub async fn assign_role(&self, user_id: &str, role_id: &str) -> Result<(), Error> {
        // Verify role exists
        let roles = self.roles.read().await;
        if !roles.contains_key(role_id) {
            return Err(Error::RoleNotFound);
        }
        drop(roles);
        
        let mut user_roles = self.user_roles.write().await;
        let roles = user_roles.entry(user_id.to_string()).or_insert_with(Vec::new);
        
        if !roles.contains(&role_id.to_string()) {
            roles.push(role_id.to_string());
        }
        
        Ok(())
    }
    
    pub async fn revoke_role(&self, user_id: &str, role_id: &str) -> Result<(), Error> {
        let mut user_roles = self.user_roles.write().await;
        
        if let Some(roles) = user_roles.get_mut(user_id) {
            roles.retain(|r| r != role_id);
        }
        
        Ok(())
    }
    
    pub async fn get_user_permissions(&self, user_id: &str) -> Result<Vec<Permission>, Error> {
        let user_roles = self.user_roles.read().await;
        let role_ids = user_roles.get(user_id).cloned().unwrap_or_default();
        
        let roles = self.roles.read().await;
        let mut permissions = Vec::new();
        
        for role_id in role_ids {
            if let Some(role) = roles.get(&role_id) {
                permissions.extend(role.permissions.clone());
            }
        }
        
        Ok(permissions)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    Create,
    Read,
    Update,
    Delete,
    Admin,
}
```

**Deliverables:**
- [ ] Role management
- [ ] Permission checking
- [ ] Condition evaluation
- [ ] Policy engine

---

### Week 2: Audit, Compliance & Backup

#### Task 3.5.3: Audit Logging
**File:** `desktop-app/src-tauri/src/enterprise/audit.rs`

```rust
pub struct AuditLogger {
    store: Arc<dyn AuditStore>,
    config: AuditConfig,
}

impl AuditLogger {
    pub fn new(store: Arc<dyn AuditStore>, config: AuditConfig) -> Self {
        Self { store, config }
    }
    
    pub async fn log(&self, entry: AuditLogEntry) -> Result<(), Error> {
        // Validate entry
        self.validate_entry(&entry)?;
        
        // Enrich entry
        let enriched = self.enrich_entry(entry).await?;
        
        // Store entry
        self.store.store(&enriched).await?;
        
        // Check for alerts
        self.check_alerts(&enriched).await?;
        
        Ok(())
    }
    
    fn validate_entry(&self, entry: &AuditLogEntry) -> Result<(), Error> {
        if entry.user_id.is_empty() {
            return Err(Error::InvalidAuditEntry("user_id is required".to_string()));
        }
        if entry.action.is_empty() {
            return Err(Error::InvalidAuditEntry("action is required".to_string()));
        }
        Ok(())
    }
    
    async fn enrich_entry(&self, mut entry: AuditLogEntry) -> Result<AuditLogEntry, Error> {
        // Add timestamp if not present
        if entry.timestamp.is_empty() {
            entry.timestamp = chrono::Utc::now().to_rfc3339();
        }
        
        // Add geo location from IP
        if let Some(geo) = self.get_geo_location(&entry.ip_address).await? {
            entry.details.insert("geo_location".to_string(), serde_json::to_value(geo)?);
        }
        
        Ok(entry)
    }
    
    pub async fn search(&self, query: AuditSearchQuery) -> Result<AuditSearchResult, Error> {
        self.store.search(query).await
    }
    
    pub async fn export(&self, query: AuditSearchQuery, format: ExportFormat) -> Result<Vec<u8>, Error> {
        let results = self.store.search(query).await?;
        
        match format {
            ExportFormat::JSON => {
                Ok(serde_json::to_vec_pretty(&results.entries)?)
            }
            ExportFormat::CSV => {
                self.export_csv(&results.entries)
            }
            ExportFormat::PDF => {
                self.export_pdf(&results.entries).await
            }
        }
    }
    
    pub async fn apply_retention_policy(&self) -> Result<RetentionResult, Error> {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(self.config.retention_days as i64);
        
        let deleted = self.store.delete_before(&cutoff.to_rfc3339()).await?;
        
        Ok(RetentionResult {
            deleted_count: deleted,
            cutoff_date: cutoff.to_rfc3339(),
        })
    }
}

// Audit decorator for automatic logging
pub struct AuditedAction<T> {
    inner: T,
    logger: Arc<AuditLogger>,
}

impl<T> AuditedAction<T> {
    pub fn new(inner: T, logger: Arc<AuditLogger>) -> Self {
        Self { inner, logger }
    }
    
    pub async fn execute<F, R>(&self, user_id: &str, action: &str, resource: &str, f: F) -> Result<R, Error>
    where
        F: FnOnce(&T) -> Result<R, Error>,
    {
        let start = std::time::Instant::now();
        
        let result = f(&self.inner);
        
        let entry = AuditLogEntry {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            user_id: user_id.to_string(),
            user_name: String::new(), // Will be enriched
            action: action.to_string(),
            resource: AuditResource {
                type_: resource.split('/').next().unwrap_or("unknown").to_string(),
                id: resource.split('/').nth(1).unwrap_or("").to_string(),
                name: String::new(),
            },
            details: HashMap::new(),
            ip_address: String::new(),
            user_agent: String::new(),
            status: if result.is_ok() { "success".to_string() } else { "failure".to_string() },
            error_message: result.as_ref().err().map(|e| e.to_string()),
            duration_ms: start.elapsed().as_millis() as u64,
        };
        
        self.logger.log(entry).await?;
        
        result
    }
}
```

**Deliverables:**
- [ ] Audit logging
- [ ] Search and filter
- [ ] Export
- [ ] Retention policies
- [ ] Alerts

#### Task 3.5.4: Compliance Reports
**File:** `desktop-app/src-tauri/src/enterprise/compliance.rs`

```rust
pub struct ComplianceEngine {
    audit_logger: Arc<AuditLogger>,
    data_inventory: Arc<DataInventory>,
}

impl ComplianceEngine {
    pub async fn generate_gdpr_report(&self, options: GDPRReportOptions) -> Result<ComplianceReport, Error> {
        let mut report = ComplianceReport {
            id: uuid::Uuid::new_v4().to_string(),
            type_: "GDPR".to_string(),
            generated_at: chrono::Utc::now().to_rfc3339(),
            period: options.period.clone(),
            sections: Vec::new(),
        };
        
        // Data inventory section
        report.sections.push(self.generate_data_inventory_section().await?);
        
        // Data processing activities
        report.sections.push(self.generate_processing_activities_section().await?);
        
        // Data subject requests
        report.sections.push(self.generate_dsr_section(&options.period).await?);
        
        // Data breaches
        report.sections.push(self.generate_breaches_section(&options.period).await?);
        
        // Consent records
        report.sections.push(self.generate_consent_section().await?);
        
        Ok(report)
    }
    
    pub async fn generate_soc2_report(&self, options: SOC2ReportOptions) -> Result<ComplianceReport, Error> {
        let mut report = ComplianceReport {
            id: uuid::Uuid::new_v4().to_string(),
            type_: "SOC2".to_string(),
            generated_at: chrono::Utc::now().to_rfc3339(),
            period: options.period.clone(),
            sections: Vec::new(),
        };
        
        // Security controls
        report.sections.push(self.generate_security_controls_section().await?);
        
        // Access controls
        report.sections.push(self.generate_access_controls_section(&options.period).await?);
        
        // Change management
        report.sections.push(self.generate_change_management_section(&options.period).await?);
        
        // Incident response
        report.sections.push(self.generate_incident_response_section(&options.period).await?);
        
        // Risk assessment
        report.sections.push(self.generate_risk_assessment_section().await?);
        
        Ok(report)
    }
    
    async fn generate_data_inventory_section(&self) -> Result<ReportSection, Error> {
        let inventory = self.data_inventory.get_all().await?;
        
        Ok(ReportSection {
            title: "Data Inventory".to_string(),
            content: serde_json::to_value(inventory)?,
            findings: Vec::new(),
            recommendations: Vec::new(),
        })
    }
    
    async fn generate_access_controls_section(&self, period: &DateRange) -> Result<ReportSection, Error> {
        // Get access logs
        let access_logs = self.audit_logger.search(AuditSearchQuery {
            start_date: Some(period.start.clone()),
            end_date: Some(period.end.clone()),
            actions: Some(vec!["login".to_string(), "logout".to_string(), "access_denied".to_string()]),
            ..Default::default()
        }).await?;
        
        // Analyze patterns
        let analysis = self.analyze_access_patterns(&access_logs.entries)?;
        
        let mut findings = Vec::new();
        let mut recommendations = Vec::new();
        
        // Check for anomalies
        if analysis.failed_login_rate > 0.1 {
            findings.push(Finding {
                severity: "medium".to_string(),
                description: format!("High failed login rate: {:.1}%", analysis.failed_login_rate * 100.0),
            });
            recommendations.push("Review authentication policies and consider implementing additional security measures".to_string());
        }
        
        Ok(ReportSection {
            title: "Access Controls".to_string(),
            content: serde_json::to_value(analysis)?,
            findings,
            recommendations,
        })
    }
}
```

**Deliverables:**
- [ ] GDPR report
- [ ] SOC2 report
- [ ] Data inventory
- [ ] Findings and recommendations

#### Task 3.5.5: Backup & Restore
**File:** `desktop-app/src-tauri/src/enterprise/backup.rs`

```rust
pub struct BackupManager {
    storage: Arc<dyn BackupStorage>,
    encryption: Arc<EncryptionService>,
    config: BackupConfig,
}

impl BackupManager {
    pub async fn create_backup(&self, options: BackupOptions) -> Result<Backup, Error> {
        let backup_id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now();
        
        let mut backup = Backup {
            id: backup_id.clone(),
            organization_id: options.organization_id.clone(),
            type_: options.backup_type.clone(),
            status: BackupStatus::InProgress,
            size: 0,
            location: String::new(),
            encryption_key: String::new(),
            created_at: now.to_rfc3339(),
            completed_at: None,
            expires_at: (now + chrono::Duration::days(self.config.retention_days as i64)).to_rfc3339(),
            metadata: BackupMetadata::default(),
        };
        
        // Generate encryption key
        let encryption_key = self.encryption.generate_key()?;
        backup.encryption_key = self.encryption.encrypt_key(&encryption_key)?;
        
        // Collect data
        let data = self.collect_backup_data(&options).await?;
        backup.metadata = self.calculate_metadata(&data);
        
        // Compress and encrypt
        let compressed = self.compress_data(&data)?;
        let encrypted = self.encryption.encrypt(&compressed, &encryption_key)?;
        backup.size = encrypted.len() as u64;
        
        // Upload to storage
        let location = self.storage.upload(&backup_id, &encrypted).await?;
        backup.location = location;
        
        // Update status
        backup.status = BackupStatus::Completed;
        backup.completed_at = Some(chrono::Utc::now().to_rfc3339());
        
        // Store backup record
        self.store_backup_record(&backup).await?;
        
        Ok(backup)
    }
    
    pub async fn restore_backup(&self, backup_id: &str, options: RestoreOptions) -> Result<RestoreResult, Error> {
        // Get backup record
        let backup = self.get_backup(backup_id).await?;
        
        if backup.status != BackupStatus::Completed {
            return Err(Error::BackupNotComplete);
        }
        
        // Download from storage
        let encrypted = self.storage.download(&backup.location).await?;
        
        // Decrypt
        let encryption_key = self.encryption.decrypt_key(&backup.encryption_key)?;
        let compressed = self.encryption.decrypt(&encrypted, &encryption_key)?;
        
        // Decompress
        let data = self.decompress_data(&compressed)?;
        
        // Restore data
        let result = match options.restore_type {
            RestoreType::Full => self.restore_full(&data, &options).await?,
            RestoreType::Selective(items) => self.restore_selective(&data, &items, &options).await?,
            RestoreType::PointInTime(timestamp) => self.restore_point_in_time(&data, &timestamp, &options).await?,
        };
        
        Ok(result)
    }
    
    async fn collect_backup_data(&self, options: &BackupOptions) -> Result<BackupData, Error> {
        let mut data = BackupData::default();
        
        // Collect workspaces
        if options.include_workspaces {
            data.workspaces = self.collect_workspaces(&options.organization_id).await?;
        }
        
        // Collect users
        if options.include_users {
            data.users = self.collect_users(&options.organization_id).await?;
        }
        
        // Collect settings
        if options.include_settings {
            data.settings = self.collect_settings(&options.organization_id).await?;
        }
        
        // Collect audit logs
        if options.include_audit_logs {
            data.audit_logs = self.collect_audit_logs(&options.organization_id).await?;
        }
        
        Ok(data)
    }
    
    pub async fn schedule_backup(&self, schedule: BackupSchedule) -> Result<(), Error> {
        // Store schedule
        self.store_schedule(&schedule).await?;
        
        // Register with scheduler
        // This would integrate with the system scheduler
        
        Ok(())
    }
    
    pub async fn verify_backup(&self, backup_id: &str) -> Result<VerificationResult, Error> {
        let backup = self.get_backup(backup_id).await?;
        
        // Download and decrypt
        let encrypted = self.storage.download(&backup.location).await?;
        let encryption_key = self.encryption.decrypt_key(&backup.encryption_key)?;
        let compressed = self.encryption.decrypt(&encrypted, &encryption_key)?;
        let data = self.decompress_data(&compressed)?;
        
        // Verify integrity
        let checksum = self.calculate_checksum(&data);
        let stored_checksum = backup.metadata.checksum.clone();
        
        let integrity_ok = checksum == stored_checksum;
        
        // Verify completeness
        let completeness = self.verify_completeness(&data, &backup.metadata)?;
        
        Ok(VerificationResult {
            backup_id: backup_id.to_string(),
            integrity_ok,
            completeness,
            verified_at: chrono::Utc::now().to_rfc3339(),
        })
    }
}
```

**Deliverables:**
- [ ] Create backup
- [ ] Restore backup
- [ ] Scheduled backups
- [ ] Backup verification
- [ ] Selective restore

#### Task 3.5.6-3.5.10: Frontend & Testing

- **3.5.6:** Enterprise Service (TypeScript)
- **3.5.7:** SSO Settings UI
- **3.5.8:** RBAC Management UI
- **3.5.9:** Audit Log Viewer
- **3.5.10:** Backup Management UI

---

## 📊 Definition of Done

- [ ] SSO ทำงานได้ (SAML, OIDC)
- [ ] RBAC ทำงานได้
- [ ] Audit logging ทำงานได้
- [ ] Compliance reports ทำงานได้
- [ ] Backup & restore ทำงานได้
- [ ] Unit tests coverage > 80%

---

## 🎯 Phase 3 Complete

เมื่อ Sprint 3.5 เสร็จสิ้น Phase 3 จะเสร็จสมบูรณ์ พร้อมสำหรับ:
- Production deployment
- Enterprise customers
- Scale operations
