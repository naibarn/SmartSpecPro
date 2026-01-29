import ContentPage from './ContentPage';
import { Briefcase } from 'lucide-react';

const defaultBody = `<h2>Join Our Team</h2>
<p>We're building the future of AI-powered creative tools. If you're passionate about artificial intelligence, great user experiences, and making technology accessible to everyone, we'd love to hear from you.</p>

<h2>Why Work With Us</h2>
<ul>
<li><strong>Cutting-Edge Technology</strong> — Work with the latest AI models and frameworks</li>
<li><strong>Impact</strong> — Your work directly helps creators and businesses worldwide</li>
<li><strong>Growth</strong> — Continuous learning opportunities and career development</li>
<li><strong>Flexibility</strong> — Remote-friendly culture with flexible working hours</li>
</ul>

<h2>Open Positions</h2>

<h3>Engineering</h3>
<ul>
<li><strong>Senior Full-Stack Engineer</strong> — TypeScript, React, Node.js, PostgreSQL</li>
<li><strong>ML/AI Engineer</strong> — Model integration, inference optimization, Python</li>
<li><strong>DevOps Engineer</strong> — Kubernetes, Docker, CI/CD, cloud infrastructure</li>
</ul>

<h3>Design</h3>
<ul>
<li><strong>Senior Product Designer</strong> — UI/UX design for AI-powered tools</li>
</ul>

<h3>Product</h3>
<ul>
<li><strong>Product Manager</strong> — AI products, user research, roadmap planning</li>
</ul>

<h2>How to Apply</h2>
<p>Send your resume and a brief introduction to our <a href="/contact">contact page</a>. Tell us why you're excited about AI and what you'd bring to the team.</p>`;

export default function Careers() {
  return (
    <ContentPage
      pageKey="careers"
      defaultTitle="Careers"
      defaultBody={defaultBody}
      icon={Briefcase}
      badge="Join Us"
      gradientFrom="emerald-500"
      gradientTo="green-500"
    />
  );
}
