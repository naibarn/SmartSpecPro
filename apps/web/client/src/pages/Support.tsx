import ContentPage from './ContentPage';
import { LifeBuoy } from 'lucide-react';

const defaultBody = `<h2>How Can We Help?</h2>
<p>We're here to help you get the most out of our platform. Choose the support option that works best for you.</p>

<h2>Support Channels</h2>

<h3>Documentation</h3>
<p>Our comprehensive <a href="/docs">documentation</a> covers everything from getting started to advanced features. Start here for quick answers.</p>

<h3>Contact Support</h3>
<p>Need personalized help? <a href="/contact">Contact our support team</a> and we'll get back to you within 24 hours.</p>

<h3>FAQ</h3>
<p>Check our <a href="/pricing">pricing page</a> for frequently asked questions about plans, credits, and billing.</p>

<h2>Common Topics</h2>
<ul>
<li><strong>Account & Billing</strong> — Manage your subscription, credits, and payment methods in Settings</li>
<li><strong>API Access</strong> — Generate and manage API keys from Settings → API Keys</li>
<li><strong>Image Generation</strong> — Tips and model selection in <a href="/docs/image-generation">Image Generation docs</a></li>
<li><strong>Video Generation</strong> — Getting started with <a href="/docs/video-generation">Video Generation</a></li>
<li><strong>Security</strong> — Best practices for keeping your account secure in <a href="/docs/security/best-practices">Security docs</a></li>
</ul>

<h2>System Status</h2>
<p>Check our <a href="/status">status page</a> for real-time platform health and any ongoing incidents.</p>`;

export default function Support() {
  return (
    <ContentPage
      pageKey="support"
      defaultTitle="Support"
      defaultBody={defaultBody}
      icon={LifeBuoy}
      badge="Support"
      gradientFrom="blue-500"
      gradientTo="indigo-500"
    />
  );
}
