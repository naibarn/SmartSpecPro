/**
 * SmartSpec Pro - SDK Code Viewer Component
 * Displays SDK code snippets for integration.
 */

import React, { useState, useMemo } from 'react';
import {
  Code,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';

// Types
type SDKLanguage = 'python' | 'javascript' | 'typescript' | 'react' | 'nextjs' | 'vue' | 'curl';

interface LanguageOption {
  id: SDKLanguage;
  name: string;
  icon: string;
  color: string;
}

// Language options
const LANGUAGES: LanguageOption[] = [
  { id: 'python', name: 'Python', icon: '🐍', color: 'bg-yellow-500' },
  { id: 'javascript', name: 'JavaScript', icon: '📜', color: 'bg-yellow-400' },
  { id: 'typescript', name: 'TypeScript', icon: '📘', color: 'bg-blue-500' },
  { id: 'react', name: 'React', icon: '⚛️', color: 'bg-cyan-500' },
  { id: 'nextjs', name: 'Next.js', icon: '▲', color: 'bg-black' },
  { id: 'vue', name: 'Vue.js', icon: '💚', color: 'bg-green-500' },
  { id: 'curl', name: 'cURL', icon: '🔗', color: 'bg-gray-500' },
];

// Code snippets
const getCodeSnippet = (language: SDKLanguage, apiKey: string = 'YOUR_API_KEY'): string => {
  const maskedKey = apiKey.length > 16 ? `${apiKey.slice(0, 12)}...${apiKey.slice(-4)}` : apiKey;

  const snippets: Record<SDKLanguage, string> = {
    python: `# Install: pip install smartspec-sdk

from smartspec import SmartSpecClient

client = SmartSpecClient(api_key="${maskedKey}")

# Generate an image
result = client.generate_image(
    prompt="A beautiful sunset over mountains",
    aspect_ratio="16:9",
    resolution="2K",
    wait=True  # Wait for completion
)

print(f"Image URL: {result.output_url}")

# Generate a video
video = client.generate_video(
    prompt="A dog running on the beach",
    duration=5,
    resolution="720p",
    wait=True
)

print(f"Video URL: {video.output_url}")

# Generate audio
audio = client.generate_audio(
    text="Hello, welcome to SmartSpec Pro!",
    voice="Rachel",
    wait=True
)

print(f"Audio URL: {audio.output_url}")`,

    javascript: `// Install: npm install @smartspec/sdk

import { SmartSpecClient } from '@smartspec/sdk';

const client = new SmartSpecClient({ apiKey: '${maskedKey}' });

// Generate an image
const image = await client.generateImage({
  prompt: 'A beautiful sunset over mountains',
  aspectRatio: '16:9',
  resolution: '2K',
  wait: true
});

console.log('Image URL:', image.outputUrl);

// Generate a video
const video = await client.generateVideo({
  prompt: 'A dog running on the beach',
  duration: 5,
  resolution: '720p',
  wait: true
});

console.log('Video URL:', video.outputUrl);

// Generate audio
const audio = await client.generateAudio({
  text: 'Hello, welcome to SmartSpec Pro!',
  voice: 'Rachel',
  wait: true
});

console.log('Audio URL:', audio.outputUrl);`,

    typescript: `// Install: npm install @smartspec/sdk

import { SmartSpecClient, GenerationResult } from '@smartspec/sdk';

const client = new SmartSpecClient({ apiKey: '${maskedKey}' });

// Generate an image with TypeScript types
const image: GenerationResult = await client.generateImage({
  prompt: 'A beautiful sunset over mountains',
  aspectRatio: '16:9',
  resolution: '2K',
  wait: true
});

console.log('Image URL:', image.outputUrl);

// Generate a video
const video: GenerationResult = await client.generateVideo({
  prompt: 'A dog running on the beach',
  duration: 5,
  resolution: '720p',
  wait: true
});

console.log('Video URL:', video.outputUrl);`,

    react: `// Install: npm install @smartspec/react

import { SmartSpecProvider, useImageGeneration } from '@smartspec/react';

// Wrap your app with the provider
function App() {
  return (
    <SmartSpecProvider apiKey="${maskedKey}">
      <ImageGenerator />
    </SmartSpecProvider>
  );
}

// Use the hook in your component
function ImageGenerator() {
  const { generate, result, isLoading, progress } = useImageGeneration();

  const handleGenerate = async () => {
    await generate({
      prompt: 'A beautiful sunset over mountains',
      aspectRatio: '16:9',
      resolution: '2K'
    });
  };

  return (
    <div>
      <button onClick={handleGenerate} disabled={isLoading}>
        {isLoading ? \`Generating... \${progress}%\` : 'Generate Image'}
      </button>
      {result?.outputUrl && (
        <img src={result.outputUrl} alt="Generated" />
      )}
    </div>
  );
}`,

    nextjs: `// Install: npm install @smartspec/sdk

// pages/api/generate.ts (API Route)
import type { NextApiRequest, NextApiResponse } from 'next';
import { SmartSpecClient } from '@smartspec/sdk';

const client = new SmartSpecClient({
  apiKey: process.env.SMARTSPEC_API_KEY!  // Store in .env.local
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt, aspectRatio, resolution } = req.body;
    
    const result = await client.generateImage({
      prompt,
      aspectRatio: aspectRatio || '1:1',
      resolution: resolution || '2K',
      wait: true
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Generation failed' });
  }
}

// .env.local
// SMARTSPEC_API_KEY=${maskedKey}`,

    vue: `<!-- Install: npm install @smartspec/sdk -->

<template>
  <div>
    <button @click="generateImage" :disabled="isLoading">
      {{ isLoading ? \`Generating... \${progress}%\` : 'Generate Image' }}
    </button>
    <img v-if="result?.outputUrl" :src="result.outputUrl" alt="Generated" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { SmartSpecClient } from '@smartspec/sdk';

const client = new SmartSpecClient({ apiKey: '${maskedKey}' });

const result = ref(null);
const isLoading = ref(false);
const progress = ref(0);

async function generateImage() {
  isLoading.value = true;
  progress.value = 0;

  try {
    const task = await client.generateImage({
      prompt: 'A beautiful sunset over mountains',
      aspectRatio: '16:9',
      resolution: '2K'
    });

    // Poll for completion
    while (!['completed', 'failed'].includes(task.status)) {
      await new Promise(r => setTimeout(r, 2000));
      const updated = await client.getTask(task.id);
      progress.value = Math.round(updated.progress * 100);
      if (updated.status === 'completed') {
        result.value = updated;
        break;
      }
    }
  } finally {
    isLoading.value = false;
  }
}
</script>`,

    curl: `# Generate an image
curl -X POST "https://api.smartspec.pro/api/v1/generation/image" \\
  -H "X-API-Key: ${maskedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "A beautiful sunset over mountains",
    "model_id": "nano-banana-pro",
    "aspect_ratio": "16:9",
    "resolution": "2K"
  }'

# Check task status
curl "https://api.smartspec.pro/api/v1/generation/tasks/TASK_ID" \\
  -H "X-API-Key: ${maskedKey}"

# Generate a video
curl -X POST "https://api.smartspec.pro/api/v1/generation/video" \\
  -H "X-API-Key: ${maskedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "A dog running on the beach",
    "model_id": "wan/2-6-text-to-video",
    "duration": 5,
    "resolution": "720p"
  }'

# Generate audio
curl -X POST "https://api.smartspec.pro/api/v1/generation/audio" \\
  -H "X-API-Key: ${maskedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Hello, welcome to SmartSpec Pro!",
    "model_id": "elevenlabs/text-to-speech-turbo-2-5",
    "voice": "Rachel"
  }'`,
  };

  return snippets[language];
};

// Code Block Component
const CodeBlock: React.FC<{
  code: string;
  language: string;
}> = ({ code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleCopy}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <pre className="p-4 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
    </div>
  );
};

// Main SDK Code Viewer Component
export const SDKCodeViewer: React.FC<{
  apiKey?: string;
}> = ({ apiKey = 'YOUR_API_KEY' }) => {
  const [selectedLanguage, setSelectedLanguage] = useState<SDKLanguage>('python');
  const [showFullSDK, setShowFullSDK] = useState(false);

  const code = useMemo(() => getCodeSnippet(selectedLanguage, apiKey), [selectedLanguage, apiKey]);



  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Code className="w-6 h-6 text-blue-500" />
          SDK Integration
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Copy and paste code to integrate AI generation into your project
        </p>
      </div>

      {/* Language Selector */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              onClick={() => setSelectedLanguage(lang.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                selectedLanguage === lang.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span>{lang.icon}</span>
              <span className="font-medium">{lang.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Code Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Installation */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Installation
          </h3>
          <CodeBlock
            code={
              selectedLanguage === 'python'
                ? 'pip install smartspec-sdk'
                : selectedLanguage === 'curl'
                ? '# No installation required'
                : 'npm install @smartspec/sdk'
            }
            language={selectedLanguage}
          />
        </div>

        {/* Quick Start */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Quick Start
          </h3>
          <CodeBlock code={code} language={selectedLanguage} />
        </div>

        {/* Environment Setup */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Environment Setup
          </h3>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>Security Tip:</strong> Never expose your API key in client-side code.
              Use environment variables or a backend proxy.
            </p>
          </div>
          <div className="mt-3">
            <CodeBlock
              code={
                selectedLanguage === 'python'
                  ? `# .env file
SMARTSPEC_API_KEY=${apiKey}

# Usage
import os
from smartspec import SmartSpecClient

client = SmartSpecClient()  # Reads from env var`
                  : `// .env file
SMARTSPEC_API_KEY=${apiKey}

// Usage (Node.js)
const client = new SmartSpecClient({
  apiKey: process.env.SMARTSPEC_API_KEY
});`
              }
              language={selectedLanguage}
            />
          </div>
        </div>

        {/* Full SDK Toggle */}
        <div>
          <button
            onClick={() => setShowFullSDK(!showFullSDK)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
          >
            {showFullSDK ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {showFullSDK ? 'Hide' : 'Show'} Full SDK Documentation
          </button>
        </div>

        {showFullSDK && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              API Reference
            </h3>

            {/* Image Generation */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                Image Generation
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-2">Parameter</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Description</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 dark:text-gray-300">
                  <tr>
                    <td className="py-1 font-mono">prompt</td>
                    <td className="py-1">string</td>
                    <td className="py-1">Text description of the image</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-mono">model</td>
                    <td className="py-1">string</td>
                    <td className="py-1">Model ID (default: nano-banana-pro)</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-mono">aspect_ratio</td>
                    <td className="py-1">string</td>
                    <td className="py-1">1:1, 16:9, 9:16, 4:3, 3:4, 21:9</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-mono">resolution</td>
                    <td className="py-1">string</td>
                    <td className="py-1">1K, 2K, 4K</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Video Generation */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                Video Generation
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-2">Parameter</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Description</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 dark:text-gray-300">
                  <tr>
                    <td className="py-1 font-mono">prompt</td>
                    <td className="py-1">string</td>
                    <td className="py-1">Text description of the video</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-mono">model</td>
                    <td className="py-1">string</td>
                    <td className="py-1">Model ID (default: wan/2-6-text-to-video)</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-mono">duration</td>
                    <td className="py-1">number</td>
                    <td className="py-1">Duration in seconds (5, 10, 15)</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-mono">resolution</td>
                    <td className="py-1">string</td>
                    <td className="py-1">720p, 1080p</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Audio Generation */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                Audio Generation
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-2">Parameter</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Description</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700 dark:text-gray-300">
                  <tr>
                    <td className="py-1 font-mono">text</td>
                    <td className="py-1">string</td>
                    <td className="py-1">Text to convert to speech</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-mono">voice</td>
                    <td className="py-1">string</td>
                    <td className="py-1">Rachel, Aria, Roger, Sarah</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-mono">stability</td>
                    <td className="py-1">number</td>
                    <td className="py-1">Voice stability (0-1)</td>
                  </tr>
                  <tr>
                    <td className="py-1 font-mono">speed</td>
                    <td className="py-1">number</td>
                    <td className="py-1">Speech speed (0.7-1.2)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Links */}
        <div className="flex items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <a
            href="https://docs.smartspec.pro"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
          >
            <ExternalLink className="w-4 h-4" />
            Full Documentation
          </a>
          <a
            href="https://github.com/smartspec/sdk"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700"
          >
            <ExternalLink className="w-4 h-4" />
            GitHub Repository
          </a>
        </div>
      </div>
    </div>
  );
};

export default SDKCodeViewer;
