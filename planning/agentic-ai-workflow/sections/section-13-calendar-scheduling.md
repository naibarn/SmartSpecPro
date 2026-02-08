# Section 13: Calendar CRUD & Smart Scheduling

**Phase**: 4 - AI Secretary
**Estimated Time**: 4-5 days
**Priority**: Medium
**Dependencies**: Section 12

---

## Overview

Implement Google Calendar CRUD operations and smart scheduling algorithm.

---

## Goals

- ✅ Calendar CRUD (list, create, update, delete events)
- ✅ Smart scheduling (find optimal meeting times)
- ✅ Webhook handling for calendar changes
- ✅ React calendar dashboard UI

---

## Implementation

**Calendar Service**:
```python
# app/services/calendar_service.py
class GoogleCalendarService:
    async def list_events(self, user_id: int, start: date, end: date):
        tokens = await get_google_tokens(user_id)
        calendar = build("calendar", "v3", credentials=tokens)

        events = calendar.events().list(
            calendarId="primary",
            timeMin=start.isoformat(),
            timeMax=end.isoformat()
        ).execute()

        return events["items"]

    async def suggest_meeting_times(
        self, user_id: int, duration_minutes: int, participants: list
    ):
        # Fetch freebusy for all participants
        # Find overlapping free slots
        # Return top 3 suggested times
```

**UI**:
```tsx
// client/src/pages/CalendarDashboard.tsx
export function CalendarDashboard() {
  const { data: events } = trpc.calendar.listEvents.useQuery({
    start: startOfWeek(new Date()),
    end: endOfWeek(new Date())
  });

  return (
    <Calendar>
      <EventList events={events} />
      <SuggestMeetingButton />
    </Calendar>
  );
}
```

---

## Completion Checklist

- [ ] CRUD operations work
- [ ] Smart scheduling works
- [ ] Webhooks handled
- [ ] UI complete

**Estimated Completion**: 4-5 days
