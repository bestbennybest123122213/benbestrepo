# 🐂 Bull BRO - Bull Replying Operator

Auto-reply command center dashboard for managing draft responses to leads.

## Quick Start

```bash
cd ~/clawd/domain-health-dashboard/bull-bro
node server.js
# Open http://localhost:3847
```

## Features

- **Draft Queue** - View and manage pending auto-reply drafts
- **Hot Lead Detection** - Gold highlighting for high buying-signal leads (≥7)
- **Quick Stats** - At-a-glance metrics (pending, hot leads, sent today, response rate)
- **Audit Log** - Track all system actions
- **Config Panel** - Adjust thresholds without editing files
- **Auto-refresh** - Updates every 30 seconds

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System health status |
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/config` | Configuration |
| PUT | `/api/config` | Update configuration |
| GET | `/api/drafts` | List all drafts |
| GET | `/api/drafts/:id` | Get single draft |
| POST | `/api/drafts/:id/send` | Mark draft as sent |
| POST | `/api/drafts/bulk-approve` | Bulk approve drafts |
| POST | `/api/drafts/bulk-archive` | Bulk archive drafts |
| POST | `/api/drafts/bulk-requeue` | Bulk requeue drafts |
| GET | `/api/audit-log` | Audit log (dashboard format) |
| GET | `/api/audit` | Audit log (detailed format) |

## CLI Commands

### Health Monitor
```bash
node health-monitor.js check    # Run health check once
node health-monitor.js watch    # Run continuously (every 5 min)
node health-monitor.js status   # Show last health status  
node health-monitor.js alerts   # Show recent alerts
```

Checks:
- SmartLead API connectivity
- Anthropic API connectivity
- Disk space (warning <5GB, error <1GB)

### Backup & Recovery
```bash
node backup.js create           # Create backup now
node backup.js list             # List all backups
node backup.js show YYYY-MM-DD  # Show backup details
node backup.js restore YYYY-MM-DD  # Restore from date
node backup.js clean            # Remove backups >30 days old
```

Backed up files: drafts.json, audit-log.json, config.json, edit-tracking.json, ghost-tracking.json, trigger-events.json, deal-velocity.json

### Audit Logger
```bash
node audit.js log <action> [details_json] [user]  # Log entry
node audit.js recent [limit] [filter]              # Show recent
node audit.js stats                                # Show statistics
```

Actions: draft_created, draft_sent, draft_edited, draft_approved, draft_archived, draft_requeued, bulk_approve, bulk_archive, bulk_requeue, config_changed, backup_created, backup_restored, health_alert

## Files

- `index.html` - Dashboard UI
- `server.js` - API server + static file serving
- `config.json` - Configuration settings
- `drafts.json` - Draft queue data
- `audit-log.json` - Activity log (keeps last 1000 entries)
- `audit.js` - Audit logging utilities
- `backup.js` - Backup & recovery utilities
- `health-monitor.js` - Health check utilities
- `health-status.json` - Last health check results
- `alerts.json` - Health alerts log
- `backups/` - Backup storage (30 day retention)

## Configuration

Edit `config.json`:

```json
{
  "confidenceThreshold": 7,
  "hotLeadThreshold": 7,
  "autoPrioritizeHotLeads": true,
  "refreshIntervalSeconds": 30
}
```

Or use the dashboard's Config Panel to adjust settings live.

## Environment Variables

For health monitoring, set:
```bash
export SMARTLEAD_API_KEY=your-key
export ANTHROPIC_API_KEY=your-key
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_KEY=your-key
```

## Port

Default: `3847` (configurable in config.json under `server.port`)
