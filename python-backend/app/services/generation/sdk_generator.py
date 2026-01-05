"""
SmartSpec Pro - SDK Generator Service
Generates customized SDK code for users to integrate into their projects.
"""

import os
from pathlib import Path
from typing import Dict, List, Optional, Any
from enum import Enum

import structlog

logger = structlog.get_logger()


class SDKLanguage(str, Enum):
    """Supported SDK languages."""
    PYTHON = "python"
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    REACT = "react"
    NEXTJS = "nextjs"
    VUE = "vue"
    CURL = "curl"


class SDKGenerator:
    """
    Generates customized SDK code and integration snippets.
    
    Features:
    - Multiple language support
    - Customized with user's API key
    - Ready-to-use code snippets
    - Full SDK templates
    """
    
    TEMPLATE_DIR = Path(__file__).parent.parent.parent / "sdk" / "templates"
    
    def __init__(self):
        self.templates: Dict[str, str] = {}
        self._load_templates()
    
    def _load_templates(self):
        """Load SDK templates from files."""
        template_files = {
            "python": "python/smartspec_client.py",
            "javascript": "javascript/smartspec-client.ts",
            "react": "react/useSmartSpec.tsx",
        }
        
        for lang, file_path in template_files.items():
            full_path = self.TEMPLATE_DIR / file_path
            if full_path.exists():
                self.templates[lang] = full_path.read_text()
    
    # =========================================================================
    # QUICK START SNIPPETS
    # =========================================================================
    
    def get_quick_start(
        self,
        language: SDKLanguage,
        api_key: str = "YOUR_API_KEY",
    ) -> str:
        """
        Get quick start code snippet.
        
        Args:
            language: Target language
            api_key: User's API key (masked for display)
            
        Returns:
            Quick start code snippet
        """
        masked_key = self._mask_api_key(api_key)
        
        snippets = {
            SDKLanguage.PYTHON: f'''# Install: pip install smartspec-sdk

from smartspec import SmartSpecClient

client = SmartSpecClient(api_key="{masked_key}")

# Generate an image
result = client.generate_image(
    prompt="A beautiful sunset over mountains",
    aspect_ratio="16:9",
    resolution="2K",
    wait=True  # Wait for completion
)

print(f"Image URL: {{result.output_url}}")
''',
            
            SDKLanguage.JAVASCRIPT: f'''// Install: npm install @smartspec/sdk

import {{ SmartSpecClient }} from '@smartspec/sdk';

const client = new SmartSpecClient({{ apiKey: '{masked_key}' }});

// Generate an image
const result = await client.generateImage({{
  prompt: 'A beautiful sunset over mountains',
  aspectRatio: '16:9',
  resolution: '2K',
  wait: true
}});

console.log('Image URL:', result.outputUrl);
''',
            
            SDKLanguage.TYPESCRIPT: f'''// Install: npm install @smartspec/sdk

import {{ SmartSpecClient, GenerationResult }} from '@smartspec/sdk';

const client = new SmartSpecClient({{ apiKey: '{masked_key}' }});

// Generate an image with TypeScript types
const result: GenerationResult = await client.generateImage({{
  prompt: 'A beautiful sunset over mountains',
  aspectRatio: '16:9',
  resolution: '2K',
  wait: true
}});

console.log('Image URL:', result.outputUrl);
''',
            
            SDKLanguage.REACT: f'''// Install: npm install @smartspec/react

import {{ SmartSpecProvider, useImageGeneration }} from '@smartspec/react';

// Wrap your app with the provider
function App() {{
  return (
    <SmartSpecProvider apiKey="{masked_key}">
      <ImageGenerator />
    </SmartSpecProvider>
  );
}}

// Use the hook in your component
function ImageGenerator() {{
  const {{ generate, result, isLoading, progress }} = useImageGeneration();

  const handleGenerate = async () => {{
    await generate({{
      prompt: 'A beautiful sunset over mountains',
      aspectRatio: '16:9',
      resolution: '2K'
    }});
  }};

  return (
    <div>
      <button onClick={{handleGenerate}} disabled={{isLoading}}>
        {{isLoading ? `Generating... ${{progress}}%` : 'Generate Image'}}
      </button>
      {{result?.outputUrl && <img src={{result.outputUrl}} alt="Generated" />}}
    </div>
  );
}}
''',
            
            SDKLanguage.NEXTJS: f'''// Install: npm install @smartspec/sdk

// pages/api/generate.ts (API Route)
import type {{ NextApiRequest, NextApiResponse }} from 'next';
import {{ SmartSpecClient }} from '@smartspec/sdk';

const client = new SmartSpecClient({{
  apiKey: process.env.SMARTSPEC_API_KEY!  // Store in .env.local
}});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {{
  if (req.method !== 'POST') {{
    return res.status(405).json({{ error: 'Method not allowed' }});
  }}

  try {{
    const {{ prompt, aspectRatio, resolution }} = req.body;
    
    const result = await client.generateImage({{
      prompt,
      aspectRatio: aspectRatio || '1:1',
      resolution: resolution || '2K',
      wait: true
    }});

    res.status(200).json(result);
  }} catch (error) {{
    res.status(500).json({{ error: 'Generation failed' }});
  }}
}}

// .env.local
// SMARTSPEC_API_KEY={masked_key}
''',
            
            SDKLanguage.VUE: f'''<!-- Install: npm install @smartspec/sdk -->

<template>
  <div>
    <button @click="generateImage" :disabled="isLoading">
      {{ isLoading ? `Generating... ${{progress}}%` : 'Generate Image' }}
    </button>
    <img v-if="result?.outputUrl" :src="result.outputUrl" alt="Generated" />
  </div>
</template>

<script setup lang="ts">
import {{ ref }} from 'vue';
import {{ SmartSpecClient }} from '@smartspec/sdk';

const client = new SmartSpecClient({{ apiKey: '{masked_key}' }});

const result = ref(null);
const isLoading = ref(false);
const progress = ref(0);

async function generateImage() {{
  isLoading.value = true;
  progress.value = 0;

  try {{
    const task = await client.generateImage({{
      prompt: 'A beautiful sunset over mountains',
      aspectRatio: '16:9',
      resolution: '2K'
    }});

    // Poll for completion
    while (!['completed', 'failed'].includes(task.status)) {{
      await new Promise(r => setTimeout(r, 2000));
      const updated = await client.getTask(task.id);
      progress.value = Math.round(updated.progress * 100);
      if (updated.status === 'completed') {{
        result.value = updated;
        break;
      }}
    }}
  }} finally {{
    isLoading.value = false;
  }}
}}
</script>
''',
            
            SDKLanguage.CURL: f'''# Generate an image
curl -X POST "https://api.smartspec.pro/api/v1/generation/image" \\
  -H "X-API-Key: {masked_key}" \\
  -H "Content-Type: application/json" \\
  -d '{{
    "prompt": "A beautiful sunset over mountains",
    "model_id": "nano-banana-pro",
    "aspect_ratio": "16:9",
    "resolution": "2K"
  }}'

# Check task status
curl "https://api.smartspec.pro/api/v1/generation/tasks/TASK_ID" \\
  -H "X-API-Key: {masked_key}"
''',
        }
        
        return snippets.get(language, snippets[SDKLanguage.PYTHON])
    
    # =========================================================================
    # FULL SDK TEMPLATES
    # =========================================================================
    
    def get_full_sdk(
        self,
        language: SDKLanguage,
        api_key: str = "YOUR_API_KEY",
        base_url: Optional[str] = None,
    ) -> str:
        """
        Get full SDK code.
        
        Args:
            language: Target language
            api_key: User's API key
            base_url: Custom API base URL
            
        Returns:
            Full SDK code
        """
        template = self.templates.get(language.value, "")
        
        if not template:
            return self.get_quick_start(language, api_key)
        
        # Customize template
        if api_key and api_key != "YOUR_API_KEY":
            masked_key = self._mask_api_key(api_key)
            template = template.replace("ss_live_xxx", masked_key)
        
        if base_url:
            template = template.replace(
                "https://api.smartspec.pro/api/v1",
                base_url
            )
        
        return template
    
    # =========================================================================
    # SPECIFIC USE CASE SNIPPETS
    # =========================================================================
    
    def get_image_generation_snippet(
        self,
        language: SDKLanguage,
        api_key: str = "YOUR_API_KEY",
        model: str = "nano-banana-pro",
        aspect_ratio: str = "1:1",
        resolution: str = "2K",
    ) -> str:
        """Get image generation code snippet."""
        masked_key = self._mask_api_key(api_key)
        
        if language == SDKLanguage.PYTHON:
            return f'''from smartspec import SmartSpecClient

client = SmartSpecClient(api_key="{masked_key}")

result = client.generate_image(
    prompt="Your prompt here",
    model="{model}",
    aspect_ratio="{aspect_ratio}",
    resolution="{resolution}",
    wait=True
)

print(f"Image URL: {{result.output_url}}")
'''
        
        elif language in (SDKLanguage.JAVASCRIPT, SDKLanguage.TYPESCRIPT):
            return f'''import {{ SmartSpecClient }} from '@smartspec/sdk';

const client = new SmartSpecClient({{ apiKey: '{masked_key}' }});

const result = await client.generateImage({{
  prompt: 'Your prompt here',
  model: '{model}',
  aspectRatio: '{aspect_ratio}',
  resolution: '{resolution}',
  wait: true
}});

console.log('Image URL:', result.outputUrl);
'''
        
        return self.get_quick_start(language, api_key)
    
    def get_video_generation_snippet(
        self,
        language: SDKLanguage,
        api_key: str = "YOUR_API_KEY",
        model: str = "wan/2-6-text-to-video",
        duration: int = 5,
        resolution: str = "720p",
    ) -> str:
        """Get video generation code snippet."""
        masked_key = self._mask_api_key(api_key)
        
        if language == SDKLanguage.PYTHON:
            return f'''from smartspec import SmartSpecClient

client = SmartSpecClient(api_key="{masked_key}")

result = client.generate_video(
    prompt="Your video description here",
    model="{model}",
    duration={duration},
    resolution="{resolution}",
    wait=True
)

print(f"Video URL: {{result.output_url}}")
'''
        
        elif language in (SDKLanguage.JAVASCRIPT, SDKLanguage.TYPESCRIPT):
            return f'''import {{ SmartSpecClient }} from '@smartspec/sdk';

const client = new SmartSpecClient({{ apiKey: '{masked_key}' }});

const result = await client.generateVideo({{
  prompt: 'Your video description here',
  model: '{model}',
  duration: {duration},
  resolution: '{resolution}',
  wait: true
}});

console.log('Video URL:', result.outputUrl);
'''
        
        return self.get_quick_start(language, api_key)
    
    def get_audio_generation_snippet(
        self,
        language: SDKLanguage,
        api_key: str = "YOUR_API_KEY",
        voice: str = "Rachel",
    ) -> str:
        """Get audio generation code snippet."""
        masked_key = self._mask_api_key(api_key)
        
        if language == SDKLanguage.PYTHON:
            return f'''from smartspec import SmartSpecClient

client = SmartSpecClient(api_key="{masked_key}")

result = client.generate_audio(
    text="Hello, welcome to SmartSpec Pro!",
    voice="{voice}",
    wait=True
)

print(f"Audio URL: {{result.output_url}}")
'''
        
        elif language in (SDKLanguage.JAVASCRIPT, SDKLanguage.TYPESCRIPT):
            return f'''import {{ SmartSpecClient }} from '@smartspec/sdk';

const client = new SmartSpecClient({{ apiKey: '{masked_key}' }});

const result = await client.generateAudio({{
  text: 'Hello, welcome to SmartSpec Pro!',
  voice: '{voice}',
  wait: true
}});

console.log('Audio URL:', result.outputUrl);
'''
        
        return self.get_quick_start(language, api_key)
    
    # =========================================================================
    # ENVIRONMENT SETUP
    # =========================================================================
    
    def get_env_setup(
        self,
        language: SDKLanguage,
        api_key: str = "YOUR_API_KEY",
    ) -> Dict[str, str]:
        """
        Get environment setup instructions.
        
        Returns dict with:
        - install: Installation command
        - env_file: Environment file content
        - env_example: Example .env file
        """
        masked_key = self._mask_api_key(api_key)
        
        if language == SDKLanguage.PYTHON:
            return {
                "install": "pip install smartspec-sdk",
                "env_file": f"SMARTSPEC_API_KEY={masked_key}",
                "env_example": "SMARTSPEC_API_KEY=ss_live_your_api_key_here",
                "usage": "from smartspec import SmartSpecClient\nclient = SmartSpecClient()  # Uses env var",
            }
        
        elif language in (SDKLanguage.JAVASCRIPT, SDKLanguage.TYPESCRIPT, SDKLanguage.REACT, SDKLanguage.NEXTJS, SDKLanguage.VUE):
            return {
                "install": "npm install @smartspec/sdk",
                "env_file": f"SMARTSPEC_API_KEY={masked_key}",
                "env_example": "SMARTSPEC_API_KEY=ss_live_your_api_key_here",
                "usage": "import { SmartSpecClient } from '@smartspec/sdk';\nconst client = new SmartSpecClient({ apiKey: process.env.SMARTSPEC_API_KEY });",
            }
        
        return {
            "install": "",
            "env_file": f"SMARTSPEC_API_KEY={masked_key}",
            "env_example": "SMARTSPEC_API_KEY=ss_live_your_api_key_here",
            "usage": "",
        }
    
    # =========================================================================
    # HELPERS
    # =========================================================================
    
    def _mask_api_key(self, api_key: str) -> str:
        """Mask API key for display."""
        if not api_key or api_key == "YOUR_API_KEY":
            return "YOUR_API_KEY"
        
        if len(api_key) > 16:
            return f"{api_key[:12]}...{api_key[-4:]}"
        
        return api_key
    
    def list_languages(self) -> List[Dict[str, str]]:
        """List supported SDK languages."""
        return [
            {"id": "python", "name": "Python", "icon": "🐍"},
            {"id": "javascript", "name": "JavaScript", "icon": "📜"},
            {"id": "typescript", "name": "TypeScript", "icon": "📘"},
            {"id": "react", "name": "React", "icon": "⚛️"},
            {"id": "nextjs", "name": "Next.js", "icon": "▲"},
            {"id": "vue", "name": "Vue.js", "icon": "💚"},
            {"id": "curl", "name": "cURL", "icon": "🔗"},
        ]


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

_sdk_generator: Optional[SDKGenerator] = None


def get_sdk_generator() -> SDKGenerator:
    """Get the singleton SDK generator instance."""
    global _sdk_generator
    if _sdk_generator is None:
        _sdk_generator = SDKGenerator()
    return _sdk_generator
