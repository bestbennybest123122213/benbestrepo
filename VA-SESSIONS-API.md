# VA Time Sessions API

API endpoints for tracking VA work sessions.

## Configuration

### GET /api/va-config
Get available VAs configuration.

**Response:**
```json
{
  "ok": true,
  "config": {
    "vas": ["Jaleel Sebastian", "VA 2"],
    "defaultVA": "Jaleel Sebastian"
  }
}
```

## Sessions

### GET /api/va-sessions
List all sessions with optional filters.

**Query Parameters:**
- `va_name` - Filter by VA name
- `start_date` - Filter sessions from this date (YYYY-MM-DD)
- `end_date` - Filter sessions until this date (YYYY-MM-DD)
- `limit` - Max results (default: 100)

**Response:**
```json
{
  "ok": true,
  "sessions": [
    {
      "id": 1,
      "sessionId": "uuid-here",
      "vaName": "Jaleel Sebastian",
      "date": "2025-04-02",
      "startTime": "2025-04-02T09:00:00Z",
      "endTime": "2025-04-02T17:00:00Z",
      "durationMinutes": 480,
      "notes": "Regular work day",
      "isActive": false
    }
  ],
  "count": 1
}
```

### GET /api/va-sessions/active
Get the currently active session (if any).

**Query Parameters:**
- `va_name` - Filter by VA name

**Response:**
```json
{
  "ok": true,
  "session": {
    "id": 1,
    "sessionId": "uuid-here",
    "vaName": "Jaleel Sebastian",
    "startTime": "2025-04-02T09:00:00Z",
    "isActive": true
  }
}
```

### POST /api/va-sessions
Create a new session (clock in).

**Request Body:**
```json
{
  "vaName": "Jaleel Sebastian",
  "startTime": "2025-04-02T09:00:00Z",
  "notes": "Starting work"
}
```

**Response:**
```json
{
  "ok": true,
  "session": { ... }
}
```

### PUT /api/va-sessions/:id
Update a session (clock out, edit).

**Request Body:**
```json
{
  "endTime": "2025-04-02T17:00:00Z",
  "notes": "Finished work"
}
```

**Notes:**
- When `endTime` is set, `is_active` is automatically set to `false`
- Duration is automatically calculated from start to end time

### DELETE /api/va-sessions/:id
Delete a session.

**Response:**
```json
{
  "ok": true,
  "deleted": 1
}
```

### POST /api/va-sessions/bulk
Bulk import sessions (for localStorage migration).

**Request Body:**
```json
{
  "sessions": [
    {
      "vaName": "Jaleel Sebastian",
      "date": "2025-04-01",
      "startTime": "2025-04-01T09:00:00Z",
      "endTime": "2025-04-01T17:00:00Z",
      "durationMinutes": 480
    }
  ]
}
```

### GET /api/va-sessions/summary
Get summary statistics by VA.

**Query Parameters:**
- `va_name` - Filter by VA name
- `start_date` - Period start (default: start of current month)
- `end_date` - Period end (default: today)

**Response:**
```json
{
  "ok": true,
  "summary": [
    {
      "vaName": "Jaleel Sebastian",
      "totalMinutes": 2400,
      "totalHours": 40,
      "sessionCount": 5,
      "daysWorked": 5,
      "avgMinutesPerSession": 480
    }
  ],
  "period": {
    "startDate": "2025-04-01",
    "endDate": "2025-04-02"
  }
}
```

## Database Migration

Run the migration SQL file to create the table:

```sql
-- File: migrations/006_create_va_time_sessions.sql
```

Execute in Supabase SQL Editor or via CLI.
