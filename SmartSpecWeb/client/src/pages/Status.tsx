import ContentPage from './ContentPage';
import { Activity } from 'lucide-react';

const defaultBody = `<h2>System Status</h2>
<p>All systems are currently <strong style="color: #22c55e;">operational</strong>.</p>

<h3>Services</h3>
<ul>
<li><strong>Web Application</strong> — Operational</li>
<li><strong>API</strong> — Operational</li>
<li><strong>Image Generation</strong> — Operational</li>
<li><strong>Video Generation</strong> — Operational</li>
<li><strong>Audio Generation</strong> — Operational</li>
<li><strong>Authentication</strong> — Operational</li>
<li><strong>Database</strong> — Operational</li>
</ul>

<h2>Uptime</h2>
<p>We maintain a 99.9% uptime SLA across all services. Our infrastructure is built on redundant, globally distributed systems.</p>

<h2>Incident History</h2>
<p>No recent incidents to report.</p>

<h2>Maintenance Windows</h2>
<p>Scheduled maintenance is typically performed during off-peak hours (UTC 02:00–06:00) with advance notice. Subscribe to our notifications to stay informed about upcoming maintenance.</p>

<h2>Report an Issue</h2>
<p>If you're experiencing problems, please <a href="/contact">contact our support team</a> immediately.</p>`;

export default function Status() {
  return (
    <ContentPage
      pageKey="status"
      defaultTitle="System Status"
      defaultBody={defaultBody}
      icon={Activity}
      badge="Status"
      gradientFrom="green-500"
      gradientTo="emerald-500"
    />
  );
}
