# Deep Plan Interview Transcript

No live interview questions were asked because the stakeholder has already provided detailed requirements, production screenshots, direct database-room IDs, and repeated decisions in the prior work thread. The following answers are inferred from those explicit requirements and should be treated as stakeholder decisions for implementation planning.

## Inferred Stakeholder Decisions

### What is the top priority?

The top priority is real autonomous execution, not conversational simulation. When a user starts automation from Work OS, the selected team must produce objective-specific deliverables and durable proof of work.

### What must change for media requests?

Image and video requests must call the actual media generation capabilities already available in Media Studio and chat skills. A video request must progress through research, storyboard, prompt generation, media job creation, polling, review, and final result tracking.

### Should chat messages remain visible?

Yes. Team room messages should remain the collaborative evidence stream, but messages must not be treated as completion by themselves.

### Who should receive the first automation message?

The team orchestrator persona should own kickoff and routing. Messages should not appear as generic "system" unless they are genuine system status events.

### What should happen when several plan paths exist?

Human-in-the-loop selection is required. The system should wait up to five minutes for a real human choice, allow rejecting all options, then replan and loop. For autonomous rooms, default fallback can continue after the timeout, but the choice/default must be recorded.

### What should happen at the end?

A reviewer persona must automatically score and comment on the actual final result. If reviewer score is below threshold, the system must replan and repair using previous history and reviewer comments. If reviewer passes, the system waits for final human review/approval when policy requires it.

### What should Work OS and My Requests show?

They must show both old and new requests, even after work is assigned to a new team room. Work OS is the control tower and must not make users think work disappeared.

### What should Team UI show?

The room needs a clear execution monitor, current room details, created time, room ID, language, mode, active route, active job, work status, stop/cancel controls, and collapsible panels so chat can use the full screen.

### What languages must be supported?

Work request creation should expose a language toggle with English default and Thai option. The selected language must be stored on the room and passed to LLM output instructions.

### What is unacceptable?

Unacceptable outcomes include:

- selecting article-writing skills for video/image objectives
- repeating similar text until `max_rounds_reached`
- marking runs complete without artifacts or job handles
- hiding assigned work from Work OS/My Requests
- requiring manual button clicks for each stage after automation is started
- creating rooms without clear date/time/identity

### What constraints should the implementation respect?

Reuse the existing codebase where possible. Do not replace the run engine, Team Rooms, Media Studio, or Agency subsystems wholesale. Add durable contracts, gates, adapters, and UI surfaces that make the existing systems work together reliably.
