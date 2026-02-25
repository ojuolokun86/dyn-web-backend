# 🎪 Event Management System

Complete guide for managing Balloon Dior events with admin controls and public visibility.

## 📋 Overview

The Event Management System allows admins to:
- **Create events** - Set up new Balloon Dior voting events
- **Open events** - Make events active for public voting
- **Close events** - Stop voting when time is up
- **Announce winners** - Declare the winner and celebrate
- **Track statistics** - Monitor total votes and engagement

The public sees:
- ✨ "Get Started" button when event is active
- 🔒 "Event Closed" message after voting ends
- 🎉 "Winner Announced" celebration page
- 📋 "Coming Soon" for draft events

## 🎯 Event Lifecycle

### State Transitions

```
[DRAFT] → [OPEN] → [CLOSED] → [WINNER_ANNOUNCED]
   ↓         ↓
[DELETE] [CLOSE] [ANNOUNCE WINNER]
```

### States Explained

**Draft** 📝
- Event created but not yet active
- Contenders can be added (coming soon)
- Admins can delete or open event
- Public cannot see "Get Started" button

**Open** 🎪
- Event is live and accepting votes
- Only one event can be open at a time
- Public sees "Get Started" button
- Voting page is accessible
- Admins can close the event

**Closed** 🔒
- Event has ended, no more votes accepted
- Results are final
- Public sees "Event Closed" message
- Admins can announce a winner
- Cannot reopen (create new event instead)

**Winner Announced** 🎉
- Winner has been selected
- Results page shows the winner
- Celebration message displays to public
- Event is complete

## 💼 Admin Panel - Event Management

### Access Events Panel

1. Login to admin dashboard
2. Click **🎪 Events** in sidebar
3. See current event card and all events list

### Create Event

1. Click **+ Create Event** button
2. Fill in event details:
   - **Event Name** * (required) - "Balloon Dior 2026"
   - **Description** - Optional event info
   - **Max Votes Per Person** - Usually 1 (default)
3. Click **Create Event**
4. Event created in **Draft** status

### Open Event (Start Voting)

1. Find event in list
2. Click **✨ Open for Voting**
3. Event status changes to **OPEN**
4. Only one event can be open at once (others auto-close)
5. Public can now access voting

### Close Event (Stop Voting)

1. Click **🔒 Close Event**
2. Voting stops immediately
3. Event status changes to **CLOSED**
4. Public sees "Event Closed" page

### Announce Winner

1. Event must be **CLOSED**
2. Click **🎯 Announce Winner**
3. Enter Contender ID of the winner
4. Event status changes to **WINNER_ANNOUNCED**
5. Public sees celebration page
6. Winner appears on results page

### Delete Event

1. Event must be in **DRAFT** status
2. Click **🗑️ Delete**
3. Event is permanently removed
4. Cannot delete open/closed events

## 📊 Current Event Card

Shows:
- Event name and description
- Current status with emoji badge
- Available actions (buttons change based on status)
- Quick access to manage event

Color-coded status badges:
- 📝 **Draft** - Gray
- 🎪 **Open** - Green
- 🔒 **Closed** - Red
- 🎉 **Winner Announced** - Yellow

## 🌐 Public Views

### Homepage (index.html)

The homepage automatically reflects event status:

#### When Event is OPEN
```
✨ Get Started
"Event Name"
[Event Description]

→ Clicking "Get Started" goes to Contenders page
```

#### When Event is DRAFT
```
📋 Event Coming Soon
"Event Name"

→ No voting available yet
```

#### When Event is CLOSED
```
🔒 Event Closed
"Event Name is no longer accepting votes"
View Results →

→ Voting disabled, results page accessible
```

#### When Winner is ANNOUNCED
```
🎉 Winner Announced!
"Event Name has concluded"
View Results →

→ Shows winner on results page
```

#### No Active Event
```
🎪 No Event Currently Active
Please check back later for our next event.
Thank you for your interest in Ballon Dior!

→ No voting available
```

## 🔌 API Endpoints

### Public Endpoints

#### GET `/api/events/current`
Get the currently active event
```bash
curl http://localhost:5000/api/events/current

Response:
{
  "success": true,
  "data": {
    "id": "event-uuid",
    "name": "Balloon Dior 2026",
    "description": "...",
    "status": "open",
    "totalVotes": 1234,
    "winnerrId": null,
    "startedAt": "2026-02-22T10:00:00Z"
  }
}
```

### Admin Endpoints

All require: `Authorization: Bearer <admin_token>`

#### GET `/api/events`
Get all events
```bash
curl http://localhost:5000/api/events \
  -H "Authorization: Bearer <token>"
```

#### GET `/api/events/:id`
Get specific event
```bash
curl http://localhost:5000/api/events/uuid \
  -H "Authorization: Bearer <token>"
```

#### POST `/api/events`
Create new event
```bash
curl -X POST http://localhost:5000/api/events \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Balloon Dior 2026",
    "description": "Annual award voting",
    "totalVotesAllowed": 1
  }'
```

#### PUT `/api/events/:id/open`
Open event for voting
```bash
curl -X PUT http://localhost:5000/api/events/uuid/open \
  -H "Authorization: Bearer <token>"
```

#### PUT `/api/events/:id/close`
Close event
```bash
curl -X PUT http://localhost:5000/api/events/uuid/close \
  -H "Authorization: Bearer <token>"
```

#### PUT `/api/events/:id/winner`
Announce winner
```bash
curl -X PUT http://localhost:5000/api/events/uuid/winner \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"winnerId": "contender-uuid"}'
```

#### DELETE `/api/events/:id`
Delete event (draft only)
```bash
curl -X DELETE http://localhost:5000/api/events/uuid \
  -H "Authorization: Bearer <token>"
```

## 📊 Database Schema

### Events Table

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('draft', 'open', 'closed', 'winner_announced')),
  startedAt TIMESTAMP,
  endedAt TIMESTAMP,
  winnerId UUID REFERENCES contenders(id),
  totalVotesAllowed INT DEFAULT 1,
  totalVotes INT DEFAULT 0,
  createdBy TEXT NOT NULL,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW()
);
```

### Fields Explained

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique event identifier |
| name | TEXT | Event display name |
| description | TEXT | Optional event details |
| status | TEXT | draft/open/closed/winner_announced |
| startedAt | TIMESTAMP | When voting began |
| endedAt | TIMESTAMP | When voting ended |
| winnerId | UUID | ID of winning contender |
| totalVotesAllowed | INT | Max votes per person (usually 1) |
| totalVotes | INT | Total votes cast |
| createdBy | TEXT | Admin who created event |
| createdAt | TIMESTAMP | Event creation time |
| updatedAt | TIMESTAMP | Last modification time |

## 🔄 Event Flow Examples

### Example 1: Complete Event Cycle

1. **Monday 10:00 AM** - Admin creates event "Balloon Dior 2026"
   - Status: DRAFT
   - Public sees: "Coming Soon"

2. **Monday 5:00 PM** - Admin opens event
   - Status: OPEN
   - Public sees: "Get Started" button
   - Users can vote

3. **Tuesday 5:00 PM** - Admin closes event
   - Status: CLOSED
   - Public sees: "Event Closed"
   - Users cannot vote

4. **Tuesday 6:00 PM** - Admin announces winner
   - Status: WINNER_ANNOUNCED
   - Public sees: "Winner Announced!"
   - Results show winner

### Example 2: Back-to-Back Events

1. Event A is OPEN
2. Admin opens Event B
3. Event A automatically closes
4. Event B is now OPEN (only one active)
5. Public sees Event B's "Get Started"

## ⚡ Quick Actions

### Fastest Way to Run an Event

```
1. Click "🎪 Events"
2. Click "+ Create Event"
3. Enter name: "Balloon Dior 2026"
4. Click "Create Event"
5. Click "✨ Open for Voting"
→ Event is now LIVE and accepting votes!

To end voting:
6. Click "🔒 Close Event"
7. Click "🎯 Announce Winner"
8. Enter winner contender ID
→ Event complete and winner announced!
```

## 🎨 Frontend Integration

### check Event Status in JavaScript

```javascript
const API_BASE_URL = 'http://localhost:5000/api';

async function getCurrentEvent() {
    const response = await fetch(`${API_BASE_URL}/events/current`);
    const result = await response.json();
    
    if (result.data) {
        const event = result.data;
        if (event.status === 'open') {
            console.log('Event is ACTIVE - show voting button');
        } else if (event.status === 'closed') {
            console.log('Event CLOSED - show results');
        }
    }
}
```

## 🔒 Business Rules

### Event Rules

1. **Only one event can be OPEN at a time**
   - Opening a new event closes the previous one automatically

2. **Cannot delete active events**
   - Only DRAFT events can be deleted
   - Close event first, then delete if needed

3. **Cannot re-open closed events**
   - Create a new event instead
   - Maintains separate voting records

4. **Winners must exist as contenders**
   - Contender must be created first
   - Winner ID references contender ID

5. **Status transitions**
   - DRAFT → OPEN (click "Open for Voting")
   - OPEN → CLOSED (click "Close Event")
   - CLOSED → WINNER_ANNOUNCED (click "Announce Winner")

## 📈 Best Practices

### Setup Recommendations

1. **Create events in advance**
   - Set up event days/hours before going live

2. **Test before opening**
   - Verify all contenders are added
   - Test voting page works

3. **Announce timing clearly**
   - Tell users when voting opens/closes
   - Set clear deadlines

4. **Monitor during event**
   - Check vote totals in real-time
   - Be ready to close if needed

5. **Celebrate the winner**
   - Announce winner promptly
   - Share on results page

## 🆘 Troubleshooting

### Event doesn't appear on public page

- Check event status in admin panel
- Verify backend is running (`npm run dev`)
- Check browser console for API errors
- Try refreshing page

### Cannot open two events

- This is intentional - only one can be OPEN
- Close the first event to open a new one

### Public doesn't see "Get Started"

- Verify event status is "OPEN"
- Check that API call returns correct data
- Try clearing browser cache

### Cannot announce winner

- Event must be CLOSED (not OPEN)
- Contender must exist in database
- Enter correct contender ID

### Event deleted by mistake

- Only DRAFT events can be deleted
- Create new event if needed
- Consider keeping backup

## 📚 Files Modified

**Backend:**
- `/backend/routes/events.js` - New event API routes
- `/backend/server.js` - Added events routes
- `/backend/ADMIN_SETUP.md` - Added events table schema

**Frontend:**
- `/frontend/admin.html` - Added Events section
- `/frontend/js/admin.js` - Added event management functions
- `/frontend/js/main.js` - Added event status checking
- `/frontend/css/admin-dashboard.css` - Added event styles
- `/frontend/css/style.css` - Added event message styles

## 🎯 Next Steps

1. **Create your first event** in admin dashboard
2. **Open event** to start accepting votes
3. **Monitor voting** as it happens
4. **Close event** when voting ends
5. **Announce winner** to celebrate
6. **Create next event** for future rounds

---

**Status:** Fully Functional ✅  
**Version:** 1.0.0  
**Last Updated:** February 22, 2026
