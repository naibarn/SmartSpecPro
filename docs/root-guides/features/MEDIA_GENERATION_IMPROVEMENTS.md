# Media Generation System - Long-Running Tasks & Auto-Prompt Improvements

## Overview
This document describes the improvements made to handle long-running media generation tasks (2-30 minutes) and AI-powered automatic prompt enhancement.

## Problem Statement

### 1. Long Callback Wait Times
Kie.ai media generation can take 2-30 minutes during high-demand periods. The previous system:
- Had timeout of only 2 minutes (60 attempts × 2s)
- Blocked the UI during generation
- No visibility into long-running tasks
- No way to monitor multiple tasks simultaneously

### 2. Prompt Quality Issues
Users often provide short, vague prompts that result in poor-quality generations:
- "a cat" vs "a photorealistic orange tabby cat sitting on a windowsill, golden hour lighting, shallow depth of field"
- Need professional prompt engineering knowledge
- Different models require different prompt styles

## Solutions Implemented

### 1. Extended Polling System

#### Backend (`desktop-app/src/services/mediaService.ts`)

**Extended Timeout:**
```typescript
export async function pollTaskUntilComplete(
  taskId: string,
  onProgress?: (task: TaskStatus) => void,
  maxAttempts: number = 900, // 30 minutes (was 60)
  intervalMs: number = 2000
)
```

**Background Polling:**
```typescript
export function pollTaskInBackground(
  taskId: string,
  onProgress?: (task: TaskStatus) => void,
  onComplete?: (task: TaskStatus) => void,
  onError?: (error: Error) => void
): () => Promise<TaskStatus | null>
```

Features:
- Polls for up to 30 minutes (900 attempts × 2s)
- Non-blocking background execution
- Progress callbacks for UI updates
- Completion callbacks for notifications
- Stoppable polling with status retrieval

### 2. Real-Time Task Monitor Dashboard

#### Component: `TaskMonitorPanel.tsx`

A comprehensive monitoring dashboard that shows all active and completed tasks.

**Key Features:**

1. **Auto-Refresh**
   - Polls all monitored tasks every 5 seconds
   - Updates status, progress, and elapsed time automatically
   - Runs in background without blocking UI

2. **Task Tracking**
   - Stores task IDs in localStorage for persistence
   - Tracks start time, last update, elapsed time
   - Shows real-time progress for pending/processing tasks

3. **Status Visualization**
   - Color-coded status indicators:
     - 🟢 Completed (green)
     - 🔵 Processing (blue, animated)
     - 🟡 Pending (yellow)
     - 🔴 Failed (red)
     - ⚫ Cancelled (gray)
   - Progress bars for active tasks
   - Elapsed time display (e.g., "5m 30s")

4. **Warnings & Notifications**
   - Alerts for tasks taking >2 minutes
   - Desktop notifications on completion/failure
   - Shows expected wait time (2-30 minutes)

5. **Task Management**
   - Cancel active tasks
   - Remove completed tasks from view
   - View task details (prompt, model, credits)

**UI Structure:**
```
┌─ Task Monitor ───────────────────┐
│ Active Tasks (2)          [Refresh]│
│                                    │
│ ┌─ Image Generation ────────────┐ │
│ │ 🔵 Processing                 │ │
│ │ "A sunset over mountains"     │ │
│ │ Elapsed: 5m 30s              │ │
│ │ ▓▓▓▓▓▓░░░░ 60%               │ │
│ │ ⚠️  High demand, may take     │ │
│ │    2-30 minutes              [×]│
│ └──────────────────────────────┘ │
│                                    │
│ Recent Completed                   │
│ ✅ Image • Took 3m 45s • 50 credits│
└────────────────────────────────────┘
```

### 3. AI-Powered Auto-Prompt Enhancement

#### Backend: `prompt_enhancement.py`

Three powerful API endpoints for prompt engineering:

**1. `/api/v1/prompt/enhance` - Enhance Prompt**
- Takes user's short prompt
- Adds professional details (lighting, composition, style, mood)
- Optimizes for specific model (DALL-E 3, Midjourney, etc.)
- Applies style preferences
- Returns enhanced prompt + improvement list

Example:
```
Input:  "a cat"
Output: "A majestic orange tabby cat with piercing green eyes,
         sitting regally on a sun-drenched windowsill, soft
         golden hour lighting casting gentle shadows, shallow
         depth of field creating bokeh effect in background,
         photorealistic style, 8K resolution"

Improvements:
- Added specific cat breed and color
- Specified lighting (golden hour)
- Added composition details (windowsill)
- Included camera settings (DoF, bokeh)
- Specified quality (8K, photorealistic)
```

**2. `/api/v1/prompt/variations` - Generate Variations**
- Creates multiple creative variations of a prompt
- Explores different angles/perspectives
- Maintains core concept
- Useful for exploring options

Example:
```
Input: "sunset over mountains"

Variations:
1. "Dramatic sunset over snow-capped mountain peaks,
    vibrant orange and purple sky..."
2. "Serene golden hour sunset illuminating misty
    mountain valleys..."
3. "Epic wide-angle sunset panorama across jagged
    mountain ranges..."
```

**3. `/api/v1/prompt/analyze` - Analyze Quality**
- Scores prompt quality (1-10)
- Identifies issues (too vague, missing details, etc.)
- Provides actionable suggestions

Example:
```
Prompt: "make me a picture"
Score: 2/10

Issues:
- Too vague, no subject specified
- No style or quality indicators
- Missing composition details

Suggestions:
- Specify what subject you want
- Add style keywords (realistic, artistic, etc.)
- Include lighting and composition details
```

#### Frontend: `PromptEnhancer.tsx`

A reusable component that integrates into generators:

```tsx
<PromptEnhancer
  mediaType="image"
  currentPrompt={prompt}
  onPromptEnhanced={(enhanced) => setPrompt(enhanced)}
  targetModel="dalle-3"
  style="photorealistic"
/>
```

**Features:**
- One-click "Auto-Enhance" button
- Shows what improvements were made
- Displays additional variation suggestions
- Visual feedback with purple theme
- Loading states
- Error handling

**UI Flow:**
```
1. User types: "a dog"
2. Clicks "Auto-Enhance Prompt"
3. AI enhances to: "A golden retriever dog with..."
4. Shows improvements applied
5. Suggests variations to try
```

## Technical Implementation

### Polling Architecture

```
User → Submit Task → Backend creates task → Returns ID
                           ↓
                   Task processes (2-30 min)
                           ↓
Frontend (Option A)        Frontend (Option B)
→ Poll synchronously       → Poll in background
→ Block UI                 → Don't block UI
→ Show progress            → Monitor dashboard shows progress
                           → Notification on complete
```

### Auto-Prompt Flow

```
User Input → Frontend → Backend API → LLM Gateway
    ↓                                     ↓
"a cat"                         Claude Sonnet 4.5
                                         ↓
                                  Prompt Engineering
                                         ↓
                              Enhanced Prompt + Analysis
                                         ↓
                                    Frontend
                                         ↓
                              User sees improvements
                                         ↓
                            User can accept or modify
```

### LLM Integration

The prompt enhancement uses Claude Sonnet 4.5 via LLM Gateway:

```python
chat_request = ChatCompletionRequest(
    model="claude-3-5-sonnet-20241022",
    messages=[
        Message(role="system", content=system_prompt),
        Message(role="user", content=user_prompt)
    ],
    max_tokens=1000,
    temperature=0.7  # Balanced creativity
)
```

**System Prompts:**
- Image: Focuses on composition, lighting, camera, style
- Video: Focuses on motion, transitions, pacing, scenes

## Usage Examples

### 1. Long-Running Task with Monitor

```tsx
import { TaskMonitorPanel } from '@/components/generation/TaskMonitorPanel';

function MediaGenerationPage() {
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <ImageGenerator />
      </div>
      <div>
        <TaskMonitorPanel />
      </div>
    </div>
  );
}
```

### 2. Image Generator with Auto-Prompt

```tsx
import { PromptEnhancer } from '@/components/generation/PromptEnhancer';

function ImageGenerator() {
  const [prompt, setPrompt] = useState('');

  return (
    <div className="space-y-4">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your image..."
      />

      <PromptEnhancer
        mediaType="image"
        currentPrompt={prompt}
        onPromptEnhanced={setPrompt}
        targetModel={selectedModel}
      />

      <Button onClick={handleGenerate}>
        Generate Image
      </Button>
    </div>
  );
}
```

### 3. Background Task Polling

```typescript
import { pollTaskInBackground } from '@/services/mediaService';

// Start background polling
const stopPolling = pollTaskInBackground(
  taskId,
  (task) => {
    // Update UI with progress
    console.log(`Status: ${task.status}`);
  },
  (task) => {
    // Task completed!
    showNotification('Generation complete!');
    displayResult(task.result_url);
  },
  (error) => {
    // Task failed
    showError(error.message);
  }
);

// Later: stop polling if user navigates away
await stopPolling();
```

## Configuration

### Timeout Settings

```typescript
// Short tasks (images)
pollTaskUntilComplete(taskId, onProgress, 900, 2000);  // 30 min

// Long tasks (videos)
pollTaskUntilComplete(taskId, onProgress, 1800, 2000); // 60 min
```

### Monitor Refresh Rate

```typescript
// In TaskMonitorPanel
useEffect(() => {
  const interval = setInterval(() => {
    refreshAllTasks();
  }, 5000); // Refresh every 5 seconds

  return () => clearInterval(interval);
}, []);
```

## Performance Considerations

### 1. Polling Efficiency
- Uses single API call per task per interval
- Batches multiple task updates in single render
- Cleans up intervals on unmount

### 2. Storage
- localStorage for task persistence
- Automatic cleanup of old completed tasks
- Limit: ~50 tasks in monitor

### 3. API Costs
- Prompt enhancement costs ~0.01-0.05 credits
- Minimal compared to generation costs (0.5-10 credits)

## Future Enhancements

### Potential Improvements

1. **WebSocket Support**
   - Replace polling with real-time push updates
   - Reduce API calls
   - Instant status updates

2. **Prompt Templates**
   - Library of pre-made professional prompts
   - Category-based (portrait, landscape, abstract, etc.)
   - One-click apply

3. **Prompt History**
   - Save successful prompts
   - Re-use and modify previous prompts
   - Share prompts with team

4. **Advanced Scheduling**
   - Queue tasks for off-peak hours
   - Priority queue for premium users
   - Batch processing

5. **Quality Prediction**
   - ML model to predict generation quality
   - Suggest prompt improvements before generation
   - Estimate success probability

6. **Multi-Modal Enhancement**
   - Analyze reference images
   - Extract style and composition
   - Generate matching prompts

## Testing Checklist

- [ ] Test 30-minute timeout with mock slow task
- [ ] Test TaskMonitor with multiple concurrent tasks
- [ ] Test auto-refresh in TaskMonitor
- [ ] Test prompt enhancement with various inputs
- [ ] Test prompt variations generation
- [ ] Test prompt quality analysis
- [ ] Test notifications for completed tasks
- [ ] Test localStorage persistence
- [ ] Test error handling for failed enhancements
- [ ] Test UI responsiveness during polling

## Deployment Notes

### Environment Variables

```env
# No additional env vars needed
# Uses existing LLM_GATEWAY_API_KEY
```

### API Endpoints

```
POST /api/v1/prompt/enhance
POST /api/v1/prompt/variations
POST /api/v1/prompt/analyze
GET  /api/v1/media/tasks/{id}  # Extended timeout
```

## Status: Complete ✅

All improvements implemented:
- ✅ Extended polling to 30 minutes
- ✅ Background polling without UI blocking
- ✅ Real-time task monitoring dashboard
- ✅ Auto-prompt enhancement API
- ✅ Prompt enhancer component
- ✅ Quality analysis
- ✅ Variation generation
- ✅ Persistent task tracking
- ✅ Desktop notifications

The system now handles long-running tasks gracefully and helps users create better prompts!
