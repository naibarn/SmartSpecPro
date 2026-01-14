# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of SmartSpecPro seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@smartspecpro.dev** (or create a private security advisory on GitHub).

You should receive a response within 48 hours. If for some reason you do not, please follow up via email to ensure we received your original message.

Please include the following information in your report:

1. **Type of issue** (e.g., buffer overflow, SQL injection, cross-site scripting)
2. **Full paths of source file(s)** related to the manifestation of the issue
3. **Location of the affected source code** (tag/branch/commit or direct URL)
4. **Step-by-step instructions** to reproduce the issue
5. **Proof-of-concept or exploit code** (if possible)
6. **Impact of the issue**, including how an attacker might exploit it

### What to Expect

After you submit a report, we will:

1. **Acknowledge receipt** of your vulnerability report within 48 hours
2. **Confirm the vulnerability** and determine its impact
3. **Develop a fix** and prepare a security update
4. **Release the fix** and publicly disclose the vulnerability (with credit to you, if desired)

We aim to resolve critical vulnerabilities within 7 days and high-severity issues within 30 days.

## Security Measures

SmartSpecPro implements the following security measures:

### Authentication & Authorization

The application uses secure token storage via the operating system's keyring (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux). Tokens are never stored in localStorage or plain text files. Session management includes automatic token refresh and secure logout.

### Data Protection

All sensitive data is encrypted at rest using AES-256-GCM encryption. API keys are stored securely and never exposed to the frontend. Database files use SQLite with WAL mode and are stored in protected application directories.

### Input Validation

All user inputs are validated and sanitized before processing. Path traversal attacks are prevented through strict path validation. SQL injection is prevented through parameterized queries. Command injection is prevented through input sanitization.

### Content Security Policy

The application enforces a strict Content Security Policy (CSP) that restricts script sources to 'self' and 'wasm-unsafe-eval', blocks inline scripts and eval, restricts connections to whitelisted domains, and prevents clickjacking through frame-ancestors.

### Rate Limiting

API calls are rate-limited to prevent abuse. Cost tracking monitors API usage. Automatic throttling protects against runaway costs.

## Security Best Practices for Users

To ensure the security of your SmartSpecPro installation, we recommend the following practices:

1. **Keep the application updated** to the latest version
2. **Use strong, unique API keys** for each provider
3. **Regularly review** your API usage and costs
4. **Enable two-factor authentication** on your LLM provider accounts
5. **Avoid sharing** your workspace databases or configuration files
6. **Report any suspicious behavior** immediately

## Vulnerability Disclosure Policy

We follow a coordinated vulnerability disclosure process:

1. Security researchers report vulnerabilities privately
2. We acknowledge and investigate the report
3. We develop and test a fix
4. We release the fix and notify users
5. We publicly disclose the vulnerability after users have had time to update

We ask that security researchers give us reasonable time to address vulnerabilities before public disclosure (typically 90 days).

## Security Contacts

For security-related inquiries, please contact:

**Email:** security@smartspecpro.dev
**GitHub Security Advisories:** [Create Advisory](https://github.com/naibarn/SmartSpecPro/security/advisories/new)

## Acknowledgments

We would like to thank the following security researchers for responsibly disclosing vulnerabilities:

*No acknowledgments yet. Be the first!*

---

This security policy is effective as of January 14, 2026, and will be updated as needed.
