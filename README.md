# GEX OS - Lead Generation Command Center

A comprehensive lead management and analytics platform for cold email outreach.

## Quick Start

```bash
# Install dependencies
npm install

# Start the dashboard
node server.js

# Or use the CLI
node gex.js help
```

## Dashboard

- **Main**: http://localhost:3456
- **Mobile**: http://localhost:3456/mobile.html
- **Webhooks**: http://localhost:3457

## CLI Commands

### Getting Started
```bash
node gex.js setup        # First-time setup wizard
node gex.js doctor       # Diagnose configuration
node gex.js version      # Version & config info
```

### Daily Operations
```bash
node gex.js pulse        # One-line status
node gex.js today        # Quick daily overview
node gex.js recent       # Recent activity (24h/week/all)
node gex.js daily        # Full daily routine
node gex.js brief        # Morning briefing
node gex.js exec         # Executive summary
```

### Lead Management
```bash
node gex.js rank               # AI lead scoring
node gex.js prep <email>       # Meeting prep
node gex.js drafts 10          # Generate emails
node gex.js calendar           # Booking messages
node gex.js mark <email> booked
```

### Data & Analytics
```bash
node gex.js export csv --filter=enterprise
node gex.js backup create
node gex.js health
```

### Notifications
```bash
node gex.js notify enterprise
node gex.js cron morning
```

### New Tools (Feb 7, 2026)
```bash
node gex.js domain-alerts       # Domain health monitoring
node gex.js verticals           # Vertical performance analysis
node gex.js prevent             # Lead decay prevention
node gex.js morning             # One-click morning routine
node gex.js actions             # Priority action queue
node gex.js compare             # Status changes since last check
node gex.js eod                 # End of day summary
```

## Key Features

- **237 CLI commands** with 42 major tools
- **Real-time dashboard** with keyboard shortcuts (⌘K)
- **Mobile-optimized view** with pull-to-refresh
- **Lead scoring** with enterprise detection
- **Email draft generation** for follow-ups
- **Backup & export** to CSV/JSON/Markdown
- **Webhook handler** for real-time updates
- **Health monitoring** system

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ⌘K / Ctrl+K | Command palette |
| G H | Go to Home |
| G L | Go to Leads |
| G B | Go to Bookings |
| R | Refresh data |
| / | Focus search |
| ? | Show help |

## File Structure

```
├── server.js           # Main dashboard server
├── gex.js              # CLI entry point
├── lib/                # Core libraries
├── public/             # Frontend assets
│   ├── index.html      # Main dashboard
│   ├── mobile.html     # Mobile view
│   └── *.js            # UI components
├── reports/            # Generated reports
├── exports/            # Data exports
└── backups/            # Database backups
```

## Environment Variables

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
```

## API Endpoints

Run `node api-docs.js` for full documentation.

### Main Server (port 3456)
- `GET /api/stats` - Pipeline statistics
- `GET /api/positive-replies` - All leads
- `GET /api/campaigns` - Campaign data
- `GET /api/domain-health` - Domain health

### Webhook Server (port 3457)
- `POST /webhook/positive-reply`
- `POST /webhook/booking`
- `GET /webhook/health`

## License

MIT
