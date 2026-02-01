import ContentPage from './ContentPage';
import { Building2 } from 'lucide-react';

const defaultBody = `<h2>Our Mission</h2>
<p>We're on a mission to make AI-powered creative tools accessible to everyone. Our platform provides state-of-the-art AI models that empower creators, designers, developers, and businesses to produce stunning content effortlessly.</p>

<h2>What We Do</h2>
<p>We provide a unified platform for AI-powered content creation — from generating photorealistic images and videos to synthesizing music and code. Our tools are designed to be intuitive yet powerful, enabling both beginners and professionals to achieve exceptional results.</p>

<h2>Our Values</h2>
<h3>Innovation</h3>
<p>We stay at the forefront of AI technology, continuously integrating the latest models and techniques to give our users the best tools available.</p>

<h3>Accessibility</h3>
<p>Powerful AI tools shouldn't be limited to experts. We design our platform to be approachable for everyone, regardless of technical background.</p>

<h3>Quality</h3>
<p>We never compromise on output quality. Every model we offer is carefully selected and optimized to produce the best results.</p>

<h3>Security</h3>
<p>Your data and creations are protected with enterprise-grade encryption, comprehensive audit logs, and strict access controls.</p>

<h2>Our Team</h2>
<p>We're a passionate team of AI researchers, engineers, and designers working together to build the future of creative AI tools. We believe in the power of technology to amplify human creativity.</p>`;

export default function About() {
  return (
    <ContentPage
      pageKey="about"
      defaultTitle="About Us"
      defaultBody={defaultBody}
      icon={Building2}
      badge="About"
    />
  );
}
