# New GEX Tools - Built Feb 6, 2026

Quick reference for all new tools built today. Run any command from the `domain-health-dashboard` directory.

## 🚀 Quick Start

```bash
cd ~/clawd/domain-health-dashboard

# Start your day
gex routine

# See ready-to-send emails
gex queue

# Open visual dashboard
gex dashboard --open
```

---

## Daily Workflow Tools

### `gex routine` / `gex morning`
**One-command morning kickoff.** Shows overnight activity, top 5 priorities, pipeline snapshot, and today's focus.

```bash
gex routine
gex routine --quick   # Essentials only
```

### `gex queue` / `gex sendq`
**Ready-to-send email queue.** Shows prioritized leads with pre-drafted responses. Copy, paste, send.

```bash
gex queue            # Top 5
gex queue --all      # All pending
gex queue --count=10 # Custom limit
```

### `gex qm` / `gex quickmark`
**Fast batch status updates.** After sending emails, quickly mark leads as contacted.

```bash
gex qm              # Show recent queue items
gex qm done 1,2,3   # Mark items 1,2,3 as contacted
gex qm booked EMAIL # Mark as meeting booked
```

### `gex followups` / `gex schedule`
**Follow-up scheduler.** Auto-sequences leads and shows what's due.

```bash
gex followups       # Due today
gex followups week  # This week's schedule
```

---

## Analytics & Reporting

### `gex weekly` / `gex report`
**Weekly performance report.** Activity, response times, pipeline health, revenue.

```bash
gex weekly          # Current week
gex weekly --last   # Last week
gex weekly --telegram  # Telegram format
```

### `gex velocity` / `gex speed`
**Pipeline velocity tracker.** Lead age distribution, bottleneck analysis, close predictions.

```bash
gex velocity          # Full report
gex velocity --predict  # Include close date predictions
```

### `gex dashboard` / `gex dash`
**Visual HTML dashboard.** Opens a browser with real-time metrics.

```bash
gex dashboard        # Generate data only
gex dashboard --open # Generate and open browser
```

---

## Sales Enablement

### `gex suggest` / `gex reply`
**AI email response suggester.** Analyzes lead intent and generates contextual responses.

```bash
gex suggest          # All pending replies
gex suggest --lead=EMAIL  # Specific lead
gex suggest --save   # Save to file
```

### `gex prep` / `gex callprep`
**Meeting prep generator.** Talking points, case studies, pricing, objection handlers.

```bash
gex prep Stillfront
gex prep marina.andersson@stillfront.com
```

### `gex roi` / `gex value`
**ROI calculator.** Calculate projected ROI for prospects by vertical.

```bash
gex roi gaming 25000    # Gaming, $25K budget
gex roi education 20000 # Education vertical
gex roi ai 30000        # AI/SaaS vertical
```

### `gex book` / `gex booking`
**Booking helper.** Convert meeting requests to booked calls.

```bash
gex book           # Show unbooked meeting requests
gex book --send    # With ready-to-send emails
gex book --cal     # Include calendar link
```

---

## Campaign & Revenue

### `gex campaign` / `gex perf`
**Campaign performance tracker.** Track live campaigns and generate client reports.

```bash
gex campaign                    # List all
gex campaign add "Brand" 25000  # Add new
gex campaign report "Brand"     # Generate report
```

### `gex notify` / `gex tg`
**Telegram notifications.** Generate formatted messages for alerts.

```bash
gex notify brief   # Morning briefing
gex notify alert   # Hot lead alert
gex notify weekly  # Weekly summary
```

---

## Dashboard Keyboard Shortcuts

When viewing the dashboard (`gex dashboard --open`):

| Key | Action |
|-----|--------|
| `/` | Open command palette |
| `R` | Refresh data |
| `Q` | Copy `gex queue` |
| `M` | Copy `gex routine` |
| `B` | Copy `gex book --send` |
| `W` | Copy `gex weekly` |
| `F` | Copy focus command |
| `?` | Show help |

---

## Summary

**Total new tools:** 13
**Total GEX commands:** 166

All tools use data from Supabase and local JSON files. No external API calls except to your own database.

---

*Built by your COO AI on Feb 6, 2026*
