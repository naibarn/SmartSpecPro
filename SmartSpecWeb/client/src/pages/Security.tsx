import ContentPage from './ContentPage';
import { Shield } from 'lucide-react';

const defaultBody = `<h2>Security at Our Core</h2>
<p>Security is fundamental to everything we build. We implement industry-leading practices to protect your data, creations, and account.</p>

<h2>Data Protection</h2>
<h3>Encryption</h3>
<ul>
<li><strong>In Transit</strong> — All connections use TLS 1.3 encryption</li>
<li><strong>At Rest</strong> — Data stored with AES-256 encryption</li>
<li><strong>API Keys</strong> — Hashed and stored securely, never in plaintext</li>
</ul>

<h3>Data Ownership</h3>
<p>Your generated content belongs to you. We do not use your creations to train AI models without your explicit consent. You can export or delete your data at any time.</p>

<h2>Authentication & Access</h2>
<ul>
<li><strong>Multi-Factor Authentication (MFA)</strong> — TOTP-based 2FA for all accounts</li>
<li><strong>OAuth Integration</strong> — Secure sign-in via Google, GitHub, and other providers</li>
<li><strong>Session Management</strong> — Secure HTTP-only cookies with automatic expiration</li>
<li><strong>Role-Based Access Control</strong> — Granular permissions for users, domain admins, and system admins</li>
</ul>

<h2>Infrastructure</h2>
<ul>
<li>Hosted on enterprise-grade cloud infrastructure</li>
<li>Regular security audits and penetration testing</li>
<li>Automated vulnerability scanning</li>
<li>DDoS protection and rate limiting</li>
</ul>

<h2>Compliance</h2>
<ul>
<li>Comprehensive audit logs for all API and account activity</li>
<li>Data processing agreements available for enterprise customers</li>
<li>GDPR-compliant data handling practices</li>
</ul>

<h2>Reporting Vulnerabilities</h2>
<p>If you discover a security vulnerability, please report it responsibly through our <a href="/contact">contact page</a>. We take all reports seriously and will respond promptly.</p>

<p>For detailed security guidelines, see our <a href="/docs/security/best-practices">Security Best Practices</a> documentation.</p>`;

export default function Security() {
  return (
    <ContentPage
      pageKey="security"
      defaultTitle="Security"
      defaultBody={defaultBody}
      icon={Shield}
      badge="Security"
      gradientFrom="red-500"
      gradientTo="rose-500"
    />
  );
}
