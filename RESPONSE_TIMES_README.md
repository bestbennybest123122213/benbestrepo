# Response Times Feature

Track how fast you reply to leads after they respond.

## Setup

### 1. Create Supabase Tables

Go to: https://supabase.com/dashboard/project/rwhqshjmngkyremwandx/sql/new

Run the SQL from `REPLY_TRACKING_SCHEMA.sql`

### 2. Run Initial Sync

```bash
cd ~/clawd/domain-health-dashboard
node sync-reply-times.js
```

For a full sync (all leads, takes longer):
```bash
node sync-reply-times.js --full
```

To just verify data without syncing:
```bash
node sync-reply-times.js --verify
```

### 3. View in Dashboard

Open the dashboard and click "⏱️ Response Times" in the sidebar.

## Features

### Dashboard Shows:
- **Today's Stats**: Quick overview of response time buckets
- **Distribution**: Under 5min, 15min, 1hr, 3hr, 24hr, over 24hr
- **Weekly Breakdown**: Compare Nov, Dec, Jan, Feb by week
- **Conversation Threads**: Click to expand and see full message timeline

### Data Tracked:
- Each conversation thread (lead + campaign combo)
- All messages in thread (our sends + their replies)
- Response times calculated for each of our replies
- Daily and weekly aggregates

### Response Time Buckets:
- ⚡ Under 5 min - Excellent!
- 🕐 Under 15 min - Great
- ⏰ Under 1 hour - Good
- 🕑 Under 3 hours - OK
- 📅 Under 24 hours - Slow
- ⚠️ Over 24 hours - Needs improvement

## Automatic Sync

A cron job runs daily at 6:30 AM Warsaw time to sync new data.

## API Endpoints

- `GET /api/response-times/daily` - Daily aggregates
- `GET /api/response-times/weekly?months=2025-11,2025-12` - Weekly by month
- `GET /api/response-times/threads?limit=50` - Conversation threads

## Data Flow

```
SmartLead API
    ↓ (statistics endpoint with email_status=replied)
sync-reply-times.js
    ↓ (message history for each lead)
Supabase
    ↓ (conversation_threads, thread_messages, response_time_daily/weekly)
Dashboard API
    ↓
Response Times UI
```

## Troubleshooting

**"Tables not found" error:**
- Run the SQL from REPLY_TRACKING_SCHEMA.sql in Supabase

**No data showing:**
- Run `node sync-reply-times.js --verify` to check SmartLead data
- Run `node sync-reply-times.js` to sync

**Slow sync:**
- Use default mode (not --full) for faster sync
- The script rate-limits to avoid API issues
