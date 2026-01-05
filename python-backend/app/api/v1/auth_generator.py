"""
Auth Generator API Router

Provides endpoints for generating authentication systems through UI.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
import subprocess
import json
import os
import tempfile
import shutil
from pathlib import Path

router = APIRouter(prefix="/auth-generator", tags=["Auth Generator"])


# ============================================================================
# Enums
# ============================================================================

class OAuthProvider(str, Enum):
    GOOGLE = "google"
    GITHUB = "github"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    MICROSOFT = "microsoft"
    APPLE = "apple"


class TwoFactorMethod(str, Enum):
    TOTP = "totp"
    SMS = "sms"
    EMAIL = "email"


class DatabaseType(str, Enum):
    PRISMA = "prisma"
    TYPEORM = "typeorm"
    MONGOOSE = "mongoose"


class TokenExpiry(str, Enum):
    MINUTES_5 = "5m"
    MINUTES_15 = "15m"
    MINUTES_30 = "30m"
    HOUR_1 = "1h"
    HOURS_6 = "6h"
    HOURS_12 = "12h"
    DAY_1 = "1d"
    DAYS_7 = "7d"
    DAYS_30 = "30d"


# ============================================================================
# Request/Response Models
# ============================================================================

class JWTConfig(BaseModel):
    """JWT configuration"""
    access_token_expiry: TokenExpiry = Field(default=TokenExpiry.MINUTES_15)
    refresh_token_expiry: TokenExpiry = Field(default=TokenExpiry.DAYS_7)
    algorithm: str = Field(default="HS256")
    issuer: Optional[str] = None


class OAuthConfig(BaseModel):
    """OAuth configuration"""
    enabled: bool = Field(default=False)
    providers: List[OAuthProvider] = Field(default_factory=list)
    callback_url: Optional[str] = None


class TwoFactorConfig(BaseModel):
    """Two-factor authentication configuration"""
    enabled: bool = Field(default=False)
    methods: List[TwoFactorMethod] = Field(default_factory=lambda: [TwoFactorMethod.TOTP])
    issuer_name: Optional[str] = None


class RBACRole(BaseModel):
    """RBAC role definition"""
    name: str
    permissions: List[str] = Field(default_factory=list)
    description: Optional[str] = None


class RBACConfig(BaseModel):
    """Role-based access control configuration"""
    enabled: bool = Field(default=False)
    roles: List[RBACRole] = Field(default_factory=lambda: [
        RBACRole(name="admin", permissions=["*"], description="Full access"),
        RBACRole(name="user", permissions=["read", "write"], description="Standard user"),
        RBACRole(name="guest", permissions=["read"], description="Read-only access"),
    ])


class APIKeyConfig(BaseModel):
    """API key configuration"""
    enabled: bool = Field(default=False)
    prefix: str = Field(default="sk_")
    expiry_days: Optional[int] = Field(default=365)
    rate_limit: Optional[int] = Field(default=1000, description="Requests per hour")


class RateLimitConfig(BaseModel):
    """Rate limiting configuration"""
    enabled: bool = Field(default=True)
    max_requests: int = Field(default=100)
    window_ms: int = Field(default=60000, description="Time window in milliseconds")
    skip_successful_requests: bool = Field(default=False)


class AuditLogConfig(BaseModel):
    """Audit logging configuration"""
    enabled: bool = Field(default=True)
    log_successful: bool = Field(default=True)
    log_failed: bool = Field(default=True)
    retention_days: int = Field(default=90)


class PasswordPolicy(BaseModel):
    """Password policy configuration"""
    min_length: int = Field(default=8)
    require_uppercase: bool = Field(default=True)
    require_lowercase: bool = Field(default=True)
    require_numbers: bool = Field(default=True)
    require_special: bool = Field(default=True)
    max_age_days: Optional[int] = Field(default=None)


class AuthGeneratorConfig(BaseModel):
    """Complete auth generator configuration"""
    project_name: str = Field(..., description="Name of the project")
    output_dir: str = Field(..., description="Output directory for generated code")
    database: DatabaseType = Field(default=DatabaseType.PRISMA)
    
    # Core features
    jwt: JWTConfig = Field(default_factory=JWTConfig)
    oauth: OAuthConfig = Field(default_factory=OAuthConfig)
    two_factor: TwoFactorConfig = Field(default_factory=TwoFactorConfig)
    rbac: RBACConfig = Field(default_factory=RBACConfig)
    api_keys: APIKeyConfig = Field(default_factory=APIKeyConfig)
    
    # Security features
    rate_limit: RateLimitConfig = Field(default_factory=RateLimitConfig)
    audit_log: AuditLogConfig = Field(default_factory=AuditLogConfig)
    password_policy: PasswordPolicy = Field(default_factory=PasswordPolicy)
    
    # Additional options
    generate_tests: bool = Field(default=True)
    generate_swagger: bool = Field(default=True)
    typescript: bool = Field(default=True)


class GeneratedFile(BaseModel):
    """Information about a generated file"""
    path: str
    type: str
    size: int
    preview: Optional[str] = None


class GenerationResult(BaseModel):
    """Result of code generation"""
    success: bool
    message: str
    files: List[GeneratedFile] = Field(default_factory=list)
    output_dir: str
    spec_file: Optional[str] = None
    errors: List[str] = Field(default_factory=list)


class PreviewRequest(BaseModel):
    """Request for code preview"""
    config: AuthGeneratorConfig
    file_type: str = Field(default="controller", description="Type of file to preview")


class PreviewResponse(BaseModel):
    """Response with code preview"""
    file_name: str
    content: str
    language: str


class TemplateInfo(BaseModel):
    """Information about a preset template"""
    id: str
    name: str
    description: str
    features: List[str]
    config: AuthGeneratorConfig


# ============================================================================
# Helper Functions
# ============================================================================

def config_to_spec(config: AuthGeneratorConfig) -> str:
    """Convert AuthGeneratorConfig to auth spec YAML format"""
    spec_lines = [
        f"# Auth Spec for {config.project_name}",
        f"# Generated by SmartSpec Pro",
        "",
        "auth:",
        f"  database: {config.database.value}",
        "",
        "  jwt:",
        f"    accessTokenExpiry: {config.jwt.access_token_expiry.value}",
        f"    refreshTokenExpiry: {config.jwt.refresh_token_expiry.value}",
        f"    algorithm: {config.jwt.algorithm}",
    ]
    
    if config.jwt.issuer:
        spec_lines.append(f"    issuer: {config.jwt.issuer}")
    
    # OAuth
    if config.oauth.enabled:
        spec_lines.extend([
            "",
            "  oauth:",
            "    enabled: true",
            "    providers:",
        ])
        for provider in config.oauth.providers:
            spec_lines.append(f"      - {provider.value}")
        if config.oauth.callback_url:
            spec_lines.append(f"    callbackUrl: {config.oauth.callback_url}")
    
    # Two-Factor
    if config.two_factor.enabled:
        spec_lines.extend([
            "",
            "  twoFactor:",
            "    enabled: true",
            "    methods:",
        ])
        for method in config.two_factor.methods:
            spec_lines.append(f"      - {method.value}")
        if config.two_factor.issuer_name:
            spec_lines.append(f"    issuerName: {config.two_factor.issuer_name}")
    
    # RBAC
    if config.rbac.enabled:
        spec_lines.extend([
            "",
            "  rbac:",
            "    enabled: true",
            "    roles:",
        ])
        for role in config.rbac.roles:
            spec_lines.append(f"      - name: {role.name}")
            if role.permissions:
                spec_lines.append(f"        permissions: [{', '.join(role.permissions)}]")
            if role.description:
                spec_lines.append(f"        description: {role.description}")
    
    # API Keys
    if config.api_keys.enabled:
        spec_lines.extend([
            "",
            "  apiKeys:",
            "    enabled: true",
            f"    prefix: {config.api_keys.prefix}",
        ])
        if config.api_keys.expiry_days:
            spec_lines.append(f"    expiryDays: {config.api_keys.expiry_days}")
        if config.api_keys.rate_limit:
            spec_lines.append(f"    rateLimit: {config.api_keys.rate_limit}")
    
    # Rate Limiting
    if config.rate_limit.enabled:
        spec_lines.extend([
            "",
            "  rateLimit:",
            "    enabled: true",
            f"    maxRequests: {config.rate_limit.max_requests}",
            f"    windowMs: {config.rate_limit.window_ms}",
        ])
    
    # Audit Log
    if config.audit_log.enabled:
        spec_lines.extend([
            "",
            "  auditLog:",
            "    enabled: true",
            f"    logSuccessful: {str(config.audit_log.log_successful).lower()}",
            f"    logFailed: {str(config.audit_log.log_failed).lower()}",
            f"    retentionDays: {config.audit_log.retention_days}",
        ])
    
    # Password Policy
    spec_lines.extend([
        "",
        "  passwordPolicy:",
        f"    minLength: {config.password_policy.min_length}",
        f"    requireUppercase: {str(config.password_policy.require_uppercase).lower()}",
        f"    requireLowercase: {str(config.password_policy.require_lowercase).lower()}",
        f"    requireNumbers: {str(config.password_policy.require_numbers).lower()}",
        f"    requireSpecial: {str(config.password_policy.require_special).lower()}",
    ])
    
    # Options
    spec_lines.extend([
        "",
        "options:",
        f"  generateTests: {str(config.generate_tests).lower()}",
        f"  generateSwagger: {str(config.generate_swagger).lower()}",
        f"  typescript: {str(config.typescript).lower()}",
    ])
    
    return "\n".join(spec_lines)


def get_auth_generator_path() -> str:
    """Get path to auth-generator CLI"""
    # Check common locations
    possible_paths = [
        "/home/ubuntu/SmartSpec/auth-generator",
        os.path.join(os.path.dirname(__file__), "../../../../auth-generator"),
        os.environ.get("AUTH_GENERATOR_PATH", ""),
    ]
    
    for path in possible_paths:
        if path and os.path.exists(path):
            return path
    
    return "/home/ubuntu/SmartSpec/auth-generator"


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/templates", response_model=List[TemplateInfo])
async def list_templates():
    """List available auth generator templates"""
    templates = [
        TemplateInfo(
            id="minimal",
            name="Minimal",
            description="Basic JWT authentication only",
            features=["JWT Auth", "Password Policy"],
            config=AuthGeneratorConfig(
                project_name="my-app",
                output_dir="./src/auth",
                oauth=OAuthConfig(enabled=False),
                two_factor=TwoFactorConfig(enabled=False),
                rbac=RBACConfig(enabled=False),
                api_keys=APIKeyConfig(enabled=False),
            )
        ),
        TemplateInfo(
            id="standard",
            name="Standard",
            description="JWT + OAuth + Rate Limiting",
            features=["JWT Auth", "OAuth (Google, GitHub)", "Rate Limiting", "Audit Log"],
            config=AuthGeneratorConfig(
                project_name="my-app",
                output_dir="./src/auth",
                oauth=OAuthConfig(enabled=True, providers=[OAuthProvider.GOOGLE, OAuthProvider.GITHUB]),
                two_factor=TwoFactorConfig(enabled=False),
                rbac=RBACConfig(enabled=False),
                api_keys=APIKeyConfig(enabled=False),
            )
        ),
        TemplateInfo(
            id="enterprise",
            name="Enterprise",
            description="Full-featured with 2FA, RBAC, and API Keys",
            features=["JWT Auth", "OAuth", "2FA/MFA", "RBAC", "API Keys", "Rate Limiting", "Audit Log"],
            config=AuthGeneratorConfig(
                project_name="my-app",
                output_dir="./src/auth",
                oauth=OAuthConfig(enabled=True, providers=[OAuthProvider.GOOGLE, OAuthProvider.GITHUB, OAuthProvider.MICROSOFT]),
                two_factor=TwoFactorConfig(enabled=True, methods=[TwoFactorMethod.TOTP, TwoFactorMethod.EMAIL]),
                rbac=RBACConfig(enabled=True),
                api_keys=APIKeyConfig(enabled=True),
            )
        ),
        TemplateInfo(
            id="saas",
            name="SaaS",
            description="Optimized for SaaS applications with multi-tenancy support",
            features=["JWT Auth", "OAuth", "2FA", "RBAC", "API Keys", "Rate Limiting", "Audit Log", "Multi-tenant Ready"],
            config=AuthGeneratorConfig(
                project_name="my-saas",
                output_dir="./src/auth",
                oauth=OAuthConfig(enabled=True, providers=[OAuthProvider.GOOGLE, OAuthProvider.GITHUB]),
                two_factor=TwoFactorConfig(enabled=True, methods=[TwoFactorMethod.TOTP]),
                rbac=RBACConfig(enabled=True, roles=[
                    RBACRole(name="owner", permissions=["*"], description="Organization owner"),
                    RBACRole(name="admin", permissions=["manage:users", "manage:settings", "read", "write"], description="Admin"),
                    RBACRole(name="member", permissions=["read", "write"], description="Team member"),
                    RBACRole(name="viewer", permissions=["read"], description="Read-only"),
                ]),
                api_keys=APIKeyConfig(enabled=True, prefix="sk_live_"),
            )
        ),
    ]
    return templates


@router.get("/templates/{template_id}", response_model=TemplateInfo)
async def get_template(template_id: str):
    """Get a specific template by ID"""
    templates = await list_templates()
    for template in templates:
        if template.id == template_id:
            return template
    raise HTTPException(status_code=404, detail=f"Template '{template_id}' not found")


@router.post("/preview", response_model=PreviewResponse)
async def preview_code(request: PreviewRequest):
    """Preview generated code without saving"""
    config = request.config
    file_type = request.file_type
    
    # Generate spec content
    spec_content = config_to_spec(config)
    
    # Map file types to preview content
    previews = {
        "spec": {
            "file_name": "auth.spec.yaml",
            "content": spec_content,
            "language": "yaml"
        },
        "controller": {
            "file_name": "auth.controller.ts",
            "content": generate_controller_preview(config),
            "language": "typescript"
        },
        "service": {
            "file_name": "auth.service.ts",
            "content": generate_service_preview(config),
            "language": "typescript"
        },
        "middleware": {
            "file_name": "auth.middleware.ts",
            "content": generate_middleware_preview(config),
            "language": "typescript"
        },
        "routes": {
            "file_name": "auth.routes.ts",
            "content": generate_routes_preview(config),
            "language": "typescript"
        },
    }
    
    if file_type not in previews:
        raise HTTPException(status_code=400, detail=f"Unknown file type: {file_type}")
    
    preview = previews[file_type]
    return PreviewResponse(**preview)


@router.post("/generate", response_model=GenerationResult)
async def generate_auth(config: AuthGeneratorConfig, background_tasks: BackgroundTasks):
    """Generate authentication system from configuration"""
    try:
        # Create output directory
        output_path = Path(config.output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        # Generate spec file
        spec_content = config_to_spec(config)
        spec_file = output_path / "auth.spec.yaml"
        spec_file.write_text(spec_content)
        
        # Get auth-generator path
        generator_path = get_auth_generator_path()
        
        # Check if auth-generator exists
        if not os.path.exists(generator_path):
            # Fallback: generate basic files directly
            return await generate_basic_auth(config, output_path, spec_file)
        
        # Run auth-generator CLI
        result = subprocess.run(
            [
                "npx", "ts-node", 
                os.path.join(generator_path, "src/cli/index.ts"),
                "generate",
                "--spec", str(spec_file),
                "--output", str(output_path),
            ],
            capture_output=True,
            text=True,
            cwd=generator_path,
            timeout=60
        )
        
        if result.returncode != 0:
            # Try alternative: use node directly
            return await generate_basic_auth(config, output_path, spec_file)
        
        # Collect generated files
        generated_files = []
        for file_path in output_path.rglob("*.ts"):
            rel_path = file_path.relative_to(output_path)
            generated_files.append(GeneratedFile(
                path=str(rel_path),
                type=get_file_type(str(rel_path)),
                size=file_path.stat().st_size,
                preview=file_path.read_text()[:500] if file_path.stat().st_size < 10000 else None
            ))
        
        return GenerationResult(
            success=True,
            message=f"Successfully generated auth system with {len(generated_files)} files",
            files=generated_files,
            output_dir=str(output_path),
            spec_file=str(spec_file)
        )
        
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Generation timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate", response_model=Dict[str, Any])
async def validate_config(config: AuthGeneratorConfig):
    """Validate auth generator configuration"""
    errors = []
    warnings = []
    
    # Validate project name
    if not config.project_name or len(config.project_name) < 2:
        errors.append("Project name must be at least 2 characters")
    
    # Validate output directory
    if not config.output_dir:
        errors.append("Output directory is required")
    
    # Validate OAuth
    if config.oauth.enabled and not config.oauth.providers:
        warnings.append("OAuth is enabled but no providers selected")
    
    # Validate 2FA
    if config.two_factor.enabled and not config.two_factor.methods:
        errors.append("2FA is enabled but no methods selected")
    
    # Validate RBAC
    if config.rbac.enabled:
        if not config.rbac.roles:
            errors.append("RBAC is enabled but no roles defined")
        else:
            role_names = [r.name for r in config.rbac.roles]
            if len(role_names) != len(set(role_names)):
                errors.append("Duplicate role names found")
    
    # Validate password policy
    if config.password_policy.min_length < 6:
        warnings.append("Password minimum length less than 6 is not recommended")
    
    # Validate rate limiting
    if config.rate_limit.enabled and config.rate_limit.max_requests < 10:
        warnings.append("Very low rate limit may affect user experience")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }


@router.get("/features")
async def list_features():
    """List all available auth features"""
    return {
        "core": [
            {"id": "jwt", "name": "JWT Authentication", "description": "JSON Web Token based authentication"},
            {"id": "oauth", "name": "OAuth 2.0", "description": "Social login with OAuth providers"},
            {"id": "two_factor", "name": "Two-Factor Auth", "description": "Additional security with 2FA/MFA"},
            {"id": "rbac", "name": "RBAC", "description": "Role-based access control"},
            {"id": "api_keys", "name": "API Keys", "description": "API key management for developers"},
        ],
        "security": [
            {"id": "rate_limit", "name": "Rate Limiting", "description": "Prevent abuse with request limits"},
            {"id": "audit_log", "name": "Audit Logging", "description": "Track authentication events"},
            {"id": "password_policy", "name": "Password Policy", "description": "Enforce strong passwords"},
        ],
        "oauth_providers": [p.value for p in OAuthProvider],
        "two_factor_methods": [m.value for m in TwoFactorMethod],
        "databases": [d.value for d in DatabaseType],
    }


# ============================================================================
# Preview Generators
# ============================================================================

def generate_controller_preview(config: AuthGeneratorConfig) -> str:
    """Generate preview of auth controller"""
    return f'''/**
 * Auth Controller
 * Generated by SmartSpec Pro for {config.project_name}
 */

import {{ Request, Response, NextFunction }} from 'express';
import {{ AuthService }} from '../services/auth.service';
import {{ LoginDto, RegisterDto }} from '../types/auth.types';

export class AuthController {{
  private authService: AuthService;

  constructor() {{
    this.authService = new AuthService();
  }}

  /**
   * Register a new user
   */
  async register(req: Request, res: Response, next: NextFunction) {{
    try {{
      const dto: RegisterDto = req.body;
      const result = await this.authService.register(dto);
      res.status(201).json(result);
    }} catch (error) {{
      next(error);
    }}
  }}

  /**
   * Login user
   */
  async login(req: Request, res: Response, next: NextFunction) {{
    try {{
      const dto: LoginDto = req.body;
      const result = await this.authService.login(dto);
      res.json(result);
    }} catch (error) {{
      next(error);
    }}
  }}

  /**
   * Refresh access token
   */
  async refreshToken(req: Request, res: Response, next: NextFunction) {{
    try {{
      const {{ refreshToken }} = req.body;
      const result = await this.authService.refreshToken(refreshToken);
      res.json(result);
    }} catch (error) {{
      next(error);
    }}
  }}

  /**
   * Logout user
   */
  async logout(req: Request, res: Response, next: NextFunction) {{
    try {{
      const {{ refreshToken }} = req.body;
      await this.authService.logout(refreshToken);
      res.status(204).send();
    }} catch (error) {{
      next(error);
    }}
  }}
{generate_oauth_controller_methods(config) if config.oauth.enabled else ""}
{generate_2fa_controller_methods(config) if config.two_factor.enabled else ""}
}}
'''


def generate_oauth_controller_methods(config: AuthGeneratorConfig) -> str:
    """Generate OAuth controller methods"""
    providers = ", ".join([p.value for p in config.oauth.providers])
    return f'''
  /**
   * OAuth login ({providers})
   */
  async oauthLogin(req: Request, res: Response, next: NextFunction) {{
    try {{
      const {{ provider }} = req.params;
      const result = await this.authService.initiateOAuth(provider);
      res.redirect(result.authUrl);
    }} catch (error) {{
      next(error);
    }}
  }}

  /**
   * OAuth callback
   */
  async oauthCallback(req: Request, res: Response, next: NextFunction) {{
    try {{
      const {{ provider }} = req.params;
      const {{ code }} = req.query;
      const result = await this.authService.handleOAuthCallback(provider, code as string);
      res.json(result);
    }} catch (error) {{
      next(error);
    }}
  }}
'''


def generate_2fa_controller_methods(config: AuthGeneratorConfig) -> str:
    """Generate 2FA controller methods"""
    methods = ", ".join([m.value for m in config.two_factor.methods])
    return f'''
  /**
   * Setup 2FA ({methods})
   */
  async setup2FA(req: Request, res: Response, next: NextFunction) {{
    try {{
      const userId = req.user!.id;
      const result = await this.authService.setup2FA(userId);
      res.json(result);
    }} catch (error) {{
      next(error);
    }}
  }}

  /**
   * Verify 2FA code
   */
  async verify2FA(req: Request, res: Response, next: NextFunction) {{
    try {{
      const userId = req.user!.id;
      const {{ code }} = req.body;
      const result = await this.authService.verify2FA(userId, code);
      res.json(result);
    }} catch (error) {{
      next(error);
    }}
  }}
'''


def generate_service_preview(config: AuthGeneratorConfig) -> str:
    """Generate preview of auth service"""
    return f'''/**
 * Auth Service
 * Generated by SmartSpec Pro for {config.project_name}
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {{ PrismaClient }} from '@prisma/client';
import {{ LoginDto, RegisterDto, AuthResult }} from '../types/auth.types';

export class AuthService {{
  private prisma: PrismaClient;
  private readonly ACCESS_TOKEN_EXPIRY = '{config.jwt.access_token_expiry.value}';
  private readonly REFRESH_TOKEN_EXPIRY = '{config.jwt.refresh_token_expiry.value}';

  constructor() {{
    this.prisma = new PrismaClient();
  }}

  async register(dto: RegisterDto): Promise<AuthResult> {{
    // Check if user exists
    const existing = await this.prisma.user.findUnique({{
      where: {{ email: dto.email }}
    }});
    
    if (existing) {{
      throw new Error('User already exists');
    }}

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create user
    const user = await this.prisma.user.create({{
      data: {{
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
      }}
    }});

    // Generate tokens
    return this.generateTokens(user);
  }}

  async login(dto: LoginDto): Promise<AuthResult> {{
    // Find user
    const user = await this.prisma.user.findUnique({{
      where: {{ email: dto.email }}
    }});

    if (!user) {{
      throw new Error('Invalid credentials');
    }}

    // Verify password
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {{
      throw new Error('Invalid credentials');
    }}

    // Generate tokens
    return this.generateTokens(user);
  }}

  private generateTokens(user: any): AuthResult {{
    const accessToken = jwt.sign(
      {{ userId: user.id, email: user.email }},
      process.env.JWT_SECRET!,
      {{ expiresIn: this.ACCESS_TOKEN_EXPIRY }}
    );

    const refreshToken = jwt.sign(
      {{ userId: user.id, type: 'refresh' }},
      process.env.JWT_SECRET!,
      {{ expiresIn: this.REFRESH_TOKEN_EXPIRY }}
    );

    return {{
      accessToken,
      refreshToken,
      user: {{
        id: user.id,
        email: user.email,
        name: user.name,
      }}
    }};
  }}
}}
'''


def generate_middleware_preview(config: AuthGeneratorConfig) -> str:
    """Generate preview of auth middleware"""
    return f'''/**
 * Auth Middleware
 * Generated by SmartSpec Pro for {config.project_name}
 */

import {{ Request, Response, NextFunction }} from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {{
  user?: {{
    id: string;
    email: string;
    role?: string;
  }};
}}

/**
 * Verify JWT token
 */
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {{
  try {{
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {{
      return res.status(401).json({{ error: 'No token provided' }});
    }}

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    req.user = {{
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    }};
    
    next();
  }} catch (error) {{
    return res.status(401).json({{ error: 'Invalid token' }});
  }}
}};
{generate_rbac_middleware(config) if config.rbac.enabled else ""}
{generate_rate_limit_middleware(config) if config.rate_limit.enabled else ""}
'''


def generate_rbac_middleware(config: AuthGeneratorConfig) -> str:
    """Generate RBAC middleware"""
    roles = ", ".join([f'"{r.name}"' for r in config.rbac.roles])
    return f'''
/**
 * Role-based access control
 * Available roles: {roles}
 */
export const requireRole = (...allowedRoles: string[]) => {{
  return (req: AuthRequest, res: Response, next: NextFunction) => {{
    if (!req.user) {{
      return res.status(401).json({{ error: 'Not authenticated' }});
    }}

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {{
      return res.status(403).json({{ error: 'Insufficient permissions' }});
    }}

    next();
  }};
}};
'''


def generate_rate_limit_middleware(config: AuthGeneratorConfig) -> str:
    """Generate rate limit middleware"""
    return f'''
/**
 * Rate limiting
 * Max {config.rate_limit.max_requests} requests per {config.rate_limit.window_ms}ms
 */
import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({{
  windowMs: {config.rate_limit.window_ms},
  max: {config.rate_limit.max_requests},
  message: {{ error: 'Too many requests, please try again later' }},
  standardHeaders: true,
  legacyHeaders: false,
}});
'''


def generate_routes_preview(config: AuthGeneratorConfig) -> str:
    """Generate preview of auth routes"""
    return f'''/**
 * Auth Routes
 * Generated by SmartSpec Pro for {config.project_name}
 */

import {{ Router }} from 'express';
import {{ AuthController }} from '../controllers/auth.controller';
import {{ authenticate, rateLimiter }} from '../middleware/auth.middleware';
import {{ validateBody }} from '../middleware/validation.middleware';
import {{ loginSchema, registerSchema }} from '../validation/auth.validation';

const router = Router();
const controller = new AuthController();

// Public routes
router.post('/register', validateBody(registerSchema), controller.register.bind(controller));
router.post('/login', {"rateLimiter, " if config.rate_limit.enabled else ""}validateBody(loginSchema), controller.login.bind(controller));
router.post('/refresh-token', controller.refreshToken.bind(controller));

// Protected routes
router.post('/logout', authenticate, controller.logout.bind(controller));
router.get('/me', authenticate, controller.getProfile.bind(controller));
{generate_oauth_routes(config) if config.oauth.enabled else ""}
{generate_2fa_routes(config) if config.two_factor.enabled else ""}
{generate_api_key_routes(config) if config.api_keys.enabled else ""}
export default router;
'''


def generate_oauth_routes(config: AuthGeneratorConfig) -> str:
    """Generate OAuth routes"""
    return '''
// OAuth routes
router.get('/oauth/:provider', controller.oauthLogin.bind(controller));
router.get('/oauth/:provider/callback', controller.oauthCallback.bind(controller));
'''


def generate_2fa_routes(config: AuthGeneratorConfig) -> str:
    """Generate 2FA routes"""
    return '''
// 2FA routes
router.post('/2fa/setup', authenticate, controller.setup2FA.bind(controller));
router.post('/2fa/verify', authenticate, controller.verify2FA.bind(controller));
router.post('/2fa/disable', authenticate, controller.disable2FA.bind(controller));
'''


def generate_api_key_routes(config: AuthGeneratorConfig) -> str:
    """Generate API key routes"""
    return '''
// API Key routes
router.get('/api-keys', authenticate, controller.listApiKeys.bind(controller));
router.post('/api-keys', authenticate, controller.createApiKey.bind(controller));
router.delete('/api-keys/:keyId', authenticate, controller.revokeApiKey.bind(controller));
'''


def get_file_type(path: str) -> str:
    """Determine file type from path"""
    if "controller" in path:
        return "controller"
    elif "service" in path:
        return "service"
    elif "middleware" in path:
        return "middleware"
    elif "route" in path:
        return "routes"
    elif "type" in path:
        return "types"
    elif "validation" in path:
        return "validation"
    elif "repository" in path:
        return "repository"
    else:
        return "other"


async def generate_basic_auth(config: AuthGeneratorConfig, output_path: Path, spec_file: Path) -> GenerationResult:
    """Generate basic auth files without using CLI"""
    generated_files = []
    
    # Create directories
    dirs = ["controllers", "services", "middleware", "routes", "types", "validation"]
    for dir_name in dirs:
        (output_path / dir_name).mkdir(parents=True, exist_ok=True)
    
    # Generate controller
    controller_content = generate_controller_preview(config)
    controller_file = output_path / "controllers" / "auth.controller.ts"
    controller_file.write_text(controller_content)
    generated_files.append(GeneratedFile(
        path="controllers/auth.controller.ts",
        type="controller",
        size=len(controller_content),
        preview=controller_content[:500]
    ))
    
    # Generate service
    service_content = generate_service_preview(config)
    service_file = output_path / "services" / "auth.service.ts"
    service_file.write_text(service_content)
    generated_files.append(GeneratedFile(
        path="services/auth.service.ts",
        type="service",
        size=len(service_content),
        preview=service_content[:500]
    ))
    
    # Generate middleware
    middleware_content = generate_middleware_preview(config)
    middleware_file = output_path / "middleware" / "auth.middleware.ts"
    middleware_file.write_text(middleware_content)
    generated_files.append(GeneratedFile(
        path="middleware/auth.middleware.ts",
        type="middleware",
        size=len(middleware_content),
        preview=middleware_content[:500]
    ))
    
    # Generate routes
    routes_content = generate_routes_preview(config)
    routes_file = output_path / "routes" / "auth.routes.ts"
    routes_file.write_text(routes_content)
    generated_files.append(GeneratedFile(
        path="routes/auth.routes.ts",
        type="routes",
        size=len(routes_content),
        preview=routes_content[:500]
    ))
    
    # Add spec file to list
    generated_files.append(GeneratedFile(
        path="auth.spec.yaml",
        type="spec",
        size=spec_file.stat().st_size,
        preview=spec_file.read_text()[:500]
    ))
    
    return GenerationResult(
        success=True,
        message=f"Successfully generated auth system with {len(generated_files)} files (basic mode)",
        files=generated_files,
        output_dir=str(output_path),
        spec_file=str(spec_file)
    )
