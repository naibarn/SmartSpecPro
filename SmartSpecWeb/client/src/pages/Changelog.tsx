import ContentPage from './ContentPage';
import { FileText } from 'lucide-react';

const defaultBody = `<h2>Latest Updates</h2>

<h3>January 2026</h3>
<ul>
<li><strong>Documentation Sub-Pages</strong> — Added comprehensive documentation covering all platform features, from getting started to security best practices.</li>
<li><strong>Theme Presets</strong> — Domain admins can now apply pre-built theme presets for quick customization.</li>
<li><strong>Content Editor Improvements</strong> — Enhanced the domain admin content editor with better defaults and instant cache clearing.</li>
</ul>

<h3>December 2025</h3>
<ul>
<li><strong>Multi-Tenant Enhancements</strong> — Improved tenant isolation, custom domain support, and per-tenant branding.</li>
<li><strong>Media Studio</strong> — Unified workspace for image, video, and audio generation.</li>
<li><strong>Skill System</strong> — Auto-sync skill detection for media generation capabilities.</li>
</ul>

<h3>November 2025</h3>
<ul>
<li><strong>Flexible Pricing Tiers</strong> — Added subscription, agency, and one-time credit packages.</li>
<li><strong>LLM Model Management</strong> — Dynamic model controls and provider configuration.</li>
<li><strong>Gallery System</strong> — Public gallery with views, likes, and download tracking.</li>
</ul>

<p>For the full changelog and release notes, check our <a href="/blog">blog</a>.</p>`;

export default function Changelog() {
  return (
    <ContentPage
      pageKey="changelog"
      defaultTitle="Changelog"
      defaultBody={defaultBody}
      icon={FileText}
      badge="Updates"
      gradientFrom="blue-500"
      gradientTo="cyan-500"
    />
  );
}
