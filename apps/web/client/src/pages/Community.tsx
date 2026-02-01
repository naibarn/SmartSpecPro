import ContentPage from './ContentPage';
import { Users } from 'lucide-react';

const defaultBody = `<h2>Welcome to the Community</h2>
<p>Join thousands of creators, developers, and AI enthusiasts who are using our platform to build amazing things. Share your work, get feedback, and learn from others.</p>

<h2>Get Involved</h2>

<h3>Gallery</h3>
<p>Browse and share AI-generated content in our <a href="/gallery">public gallery</a>. Get inspired by what others are creating and showcase your best work.</p>

<h3>Share Your Creations</h3>
<p>Every image, video, or audio piece you generate can be shared to the gallery. Build your portfolio and inspire others.</p>

<h3>Tips & Tricks</h3>
<p>Learn prompt engineering techniques, discover model-specific tips, and improve your AI generation skills through our <a href="/docs">documentation</a> and community guides.</p>

<h2>Community Guidelines</h2>
<ul>
<li><strong>Be Respectful</strong> — Treat everyone with kindness and professionalism</li>
<li><strong>Share Knowledge</strong> — Help others learn and grow with constructive feedback</li>
<li><strong>Create Responsibly</strong> — Follow our content policies and respect intellectual property</li>
<li><strong>Report Issues</strong> — Help keep the community safe by reporting inappropriate content</li>
</ul>

<h2>Stay Connected</h2>
<p>Follow us for updates, tutorials, and community highlights. Have questions? Visit our <a href="/contact">contact page</a>.</p>`;

export default function Community() {
  return (
    <ContentPage
      pageKey="community"
      defaultTitle="Community"
      defaultBody={defaultBody}
      icon={Users}
      badge="Community"
      gradientFrom="orange-500"
      gradientTo="amber-500"
    />
  );
}
