# Test Spec with Assets

This is a test specification file for testing the `analyze_spec_for_assets` tool.

## 1. Hero Section

The hero section should have a beautiful background image.

![Hero Background](assets/hero_bg.png "model: google-nano-banana-pro, prompt: A futuristic tech landscape with glowing circuits and abstract shapes in blue and purple colors")

## 2. Features Section

### Feature 1: AI Assistant
![AI Assistant Icon](assets/ai_assistant.png "model: flux-2.0, prompt: A friendly robot assistant icon, minimalist design, blue gradient")

### Feature 2: Analytics Dashboard
<!-- ASSET: type=image, filename=analytics_dashboard.png, model=google-nano-banana-pro, prompt=A modern analytics dashboard with charts and graphs, dark theme -->

## 3. Video Demo

We need a promotional video for the landing page.

```asset
type: video
filename: promo_video.mp4
model: veo-3-1
prompt: A 10-second promotional video showing a developer using SmartSpec Pro to generate code automatically
```

## 4. Audio Assets

### Welcome Message
[GENERATE_AUDIO: Welcome to SmartSpec Pro, your AI-powered development assistant -> welcome_message.mp3]

### Background Music
<!-- ASSET: type=audio, filename=bg_music.mp3, model=elevenlabs-sfx, prompt=Soft ambient background music for a tech product -->

## 5. Additional Images

[GENERATE_IMAGE: A modern logo for SmartSpec Pro with abstract geometric shapes -> logo.png]

[GENERATE_IMAGE: Team collaboration illustration showing developers working together -> team_collab.png]

## 6. Regular Markdown Images (No Generation)

These are regular images that should NOT be picked up:

![Regular Image](https://example.com/image.png)
![Another Image](./existing/image.jpg)

## Summary

This spec contains:
- 3 images with markdown syntax
- 2 images with HTML comment syntax
- 1 video with YAML block syntax
- 2 audio assets
- 2 images with placeholder syntax

Total: 10 assets to generate
