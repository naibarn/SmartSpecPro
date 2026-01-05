/**
 * Workflow templates for quick start
 */

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  config: Record<string, any>;
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "spec-generation-basic",
    name: "Basic Specification Generation",
    description: "Generate a basic specification document for any feature or module",
    category: "Specification",
    icon: "📄",
    config: {
      format: "markdown",
      detail_level: "standard",
      include_examples: true,
      include_diagrams: false,
    },
  },
  {
    id: "spec-generation-comprehensive",
    name: "Comprehensive Specification",
    description: "Generate a detailed specification with diagrams, examples, and test cases",
    category: "Specification",
    icon: "📚",
    config: {
      format: "markdown",
      detail_level: "comprehensive",
      include_examples: true,
      include_diagrams: true,
      include_test_cases: true,
      include_api_docs: true,
    },
  },
  {
    id: "api-spec-generation",
    name: "API Specification",
    description: "Generate OpenAPI/Swagger specification for REST APIs",
    category: "API",
    icon: "🔌",
    config: {
      format: "openapi",
      version: "3.0",
      include_examples: true,
      include_schemas: true,
      include_security: true,
    },
  },
  {
    id: "spec-validation",
    name: "Specification Validation",
    description: "Validate existing specification documents for completeness and correctness",
    category: "Validation",
    icon: "✅",
    config: {
      check_completeness: true,
      check_consistency: true,
      check_best_practices: true,
      output_format: "detailed",
    },
  },
  {
    id: "requirements-analysis",
    name: "Requirements Analysis",
    description: "Analyze requirements documents and extract key information",
    category: "Analysis",
    icon: "🔍",
    config: {
      extract_functional: true,
      extract_non_functional: true,
      identify_dependencies: true,
      generate_traceability: true,
    },
  },
  {
    id: "test-case-generation",
    name: "Test Case Generation",
    description: "Generate comprehensive test cases from specifications",
    category: "Testing",
    icon: "🧪",
    config: {
      include_unit_tests: true,
      include_integration_tests: true,
      include_edge_cases: true,
      test_framework: "jest",
    },
  },
  {
    id: "database-schema-spec",
    name: "Database Schema Specification",
    description: "Generate database schema specification with relationships",
    category: "Database",
    icon: "🗄️",
    config: {
      format: "sql",
      include_indexes: true,
      include_constraints: true,
      include_migrations: true,
      database_type: "postgresql",
    },
  },
  {
    id: "security-spec",
    name: "Security Specification",
    description: "Generate security requirements and implementation specifications",
    category: "Security",
    icon: "🔒",
    config: {
      include_authentication: true,
      include_authorization: true,
      include_encryption: true,
      include_audit_logging: true,
      compliance_standards: ["OWASP", "GDPR"],
    },
  },
  {
    id: "microservice-spec",
    name: "Microservice Specification",
    description: "Generate specification for microservice architecture",
    category: "Architecture",
    icon: "🏗️",
    config: {
      include_service_boundaries: true,
      include_api_contracts: true,
      include_data_flow: true,
      include_deployment: true,
      communication_pattern: "rest",
    },
  },
  {
    id: "mobile-app-spec",
    name: "Mobile App Specification",
    description: "Generate specification for mobile applications (iOS/Android)",
    category: "Mobile",
    icon: "📱",
    config: {
      platforms: ["ios", "android"],
      include_ui_specs: true,
      include_offline_support: true,
      include_push_notifications: true,
      design_system: "material",
    },
  },
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return workflowTemplates.filter((t) => t.category === category);
}

/**
 * Get all categories
 */
export function getCategories(): string[] {
  return Array.from(new Set(workflowTemplates.map((t) => t.category)));
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return workflowTemplates.find((t) => t.id === id);
}
