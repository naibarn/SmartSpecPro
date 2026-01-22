/**
 * PII (Personally Identifiable Information) Filter Service
 * Detects and filters sensitive information from text before storage
 */

// PII detection patterns
const PII_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  // Email addresses
  {
    name: "email",
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: "[EMAIL_REDACTED]",
  },
  // Phone numbers (various formats)
  {
    name: "phone",
    pattern: /(?:\+?(\d{1,3}))?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    replacement: "[PHONE_REDACTED]",
  },
  // Thai phone numbers
  {
    name: "thai_phone",
    pattern: /(?:0[689]\d{8}|0[1-5]\d{7})/g,
    replacement: "[PHONE_REDACTED]",
  },
  // Credit card numbers (basic patterns)
  {
    name: "credit_card",
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: "[CARD_REDACTED]",
  },
  // Social Security Numbers (US)
  {
    name: "ssn",
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    replacement: "[SSN_REDACTED]",
  },
  // Thai ID Card numbers (13 digits)
  {
    name: "thai_id",
    pattern: /\b\d[-\s]?\d{4}[-\s]?\d{5}[-\s]?\d{2}[-\s]?\d\b/g,
    replacement: "[ID_REDACTED]",
  },
  // IP addresses
  {
    name: "ip_address",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: "[IP_REDACTED]",
  },
  // Passport numbers (generic pattern)
  {
    name: "passport",
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/gi,
    replacement: "[PASSPORT_REDACTED]",
  },
  // Bank account numbers (Thai format: 10-12 digits)
  {
    name: "bank_account",
    pattern: /\b\d{3}[-\s]?\d{1}[-\s]?\d{5}[-\s]?\d{1}\b/g,
    replacement: "[BANK_REDACTED]",
  },
  // API keys / secrets (common patterns)
  {
    name: "api_key",
    pattern: /\b(?:sk|pk|api)[_-](?:live|test|prod)?[_-]?[a-zA-Z0-9]{20,}\b/gi,
    replacement: "[API_KEY_REDACTED]",
  },
  // JWT tokens
  {
    name: "jwt_token",
    pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    replacement: "[TOKEN_REDACTED]",
  },
  // AWS access keys
  {
    name: "aws_key",
    pattern: /\b(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: "[AWS_KEY_REDACTED]",
  },
  // Private keys (partial match for safety)
  {
    name: "private_key",
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
    replacement: "[PRIVATE_KEY_REDACTED]",
  },
  // Dates of birth (common formats, may need refinement)
  {
    name: "dob",
    pattern: /\b(?:born|dob|birthdate|birth\s*date)[\s:]+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/gi,
    replacement: "[DOB_REDACTED]",
  },
];

// Sensitive keywords that indicate PII context
const SENSITIVE_KEYWORDS = [
  "password",
  "secret",
  "credential",
  "private",
  "confidential",
  "ssn",
  "social security",
  "credit card",
  "bank account",
  "api key",
  "access token",
  "auth token",
  "bearer token",
];

export interface PIIDetectionResult {
  hasPII: boolean;
  detectedTypes: string[];
  sanitizedText: string;
  redactedCount: number;
}

/**
 * Detect and redact PII from text
 */
export function detectAndRedactPII(text: string): PIIDetectionResult {
  let sanitizedText = text;
  const detectedTypes: Set<string> = new Set();
  let redactedCount = 0;

  for (const { name, pattern, replacement } of PII_PATTERNS) {
    const matches = sanitizedText.match(pattern);
    if (matches && matches.length > 0) {
      detectedTypes.add(name);
      redactedCount += matches.length;
      sanitizedText = sanitizedText.replace(pattern, replacement);
    }
  }

  return {
    hasPII: detectedTypes.size > 0,
    detectedTypes: Array.from(detectedTypes),
    sanitizedText,
    redactedCount,
  };
}

/**
 * Check if text contains sensitive keywords
 */
export function containsSensitiveKeywords(text: string): boolean {
  const lowerText = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

/**
 * Filter entity facts to remove PII
 */
export function filterEntityFacts(facts: string[]): {
  filteredFacts: string[];
  removedCount: number;
  redactedCount: number;
} {
  const filteredFacts: string[] = [];
  let removedCount = 0;
  let totalRedacted = 0;

  for (const fact of facts) {
    // Skip facts that are primarily sensitive keywords
    if (containsSensitiveKeywords(fact)) {
      const words = fact.split(/\s+/).filter(Boolean);
      const sensitiveWordCount = words.filter((w) =>
        SENSITIVE_KEYWORDS.some((kw) => w.toLowerCase().includes(kw))
      ).length;

      // If more than 30% of words are sensitive, skip entirely
      if (sensitiveWordCount / words.length > 0.3) {
        removedCount++;
        continue;
      }
    }

    // Detect and redact PII
    const { hasPII, sanitizedText, redactedCount } = detectAndRedactPII(fact);

    if (hasPII) {
      totalRedacted += redactedCount;

      // If the sanitized text is mostly redactions, skip it
      const redactionRatio =
        (sanitizedText.match(/\[[\w_]+\]/g) || []).length / fact.split(/\s+/).length;

      if (redactionRatio > 0.5) {
        removedCount++;
        continue;
      }

      filteredFacts.push(sanitizedText);
    } else {
      filteredFacts.push(fact);
    }
  }

  return {
    filteredFacts,
    removedCount,
    redactedCount: totalRedacted,
  };
}

/**
 * Check if an entity name might be PII
 */
export function isEntityNamePII(name: string): boolean {
  const result = detectAndRedactPII(name);
  if (result.hasPII) return true;

  // Check for patterns that might be names
  // Be conservative - allow common project/preference names
  const safePrefixes = [
    "coding", "development", "project", "app", "system",
    "preference", "config", "setting", "tool", "framework",
    "language", "library", "database", "api", "service",
  ];

  const lowerName = name.toLowerCase();
  if (safePrefixes.some((prefix) => lowerName.startsWith(prefix))) {
    return false;
  }

  // If it looks like a full name (two or more capitalized words), flag it
  const namePattern = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/;
  if (namePattern.test(name)) {
    return true;
  }

  return false;
}

/**
 * Sanitize entity before storage
 */
export function sanitizeEntityForStorage(entity: {
  type: string;
  name: string;
  fact: string;
}): { type: string; name: string; fact: string } | null {
  // Check if entity name is PII
  if (isEntityNamePII(entity.name)) {
    // For user type, allow but redact the name
    if (entity.type === "user") {
      const { sanitizedText } = detectAndRedactPII(entity.name);
      entity.name = sanitizedText || "user";
    } else {
      return null; // Skip non-user entities with PII names
    }
  }

  // Filter the fact
  const { filteredFacts, removedCount } = filterEntityFacts([entity.fact]);

  if (removedCount > 0 || filteredFacts.length === 0) {
    return null;
  }

  return {
    type: entity.type,
    name: entity.name,
    fact: filteredFacts[0],
  };
}
