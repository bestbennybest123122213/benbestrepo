# 🛠️ CLI Tools for ItssIMANNN Lead Gen

All tools are in `~/clawd/domain-health-dashboard/`

## Quick Start

```bash
cd ~/clawd/domain-health-dashboard

# Quick status check (pipeline, stale, meetings)
node status.js

# Full morning briefing
node daily-ops.js
```

---

## 📊 Daily Operations

### `status.js` ⚡ FASTEST CHECK
**Quick status of everything in 2 seconds**
```bash
node status.js
```
Shows: Pipeline stats, stale leads count, next meeting, top priority lead

### `priority.js` 🎯 TODAY'S PRIORITY
**Top 10 leads to follow up today, scored by urgency**
```bash
node priority.js
```
Shows: Ranked leads with scores, stale days, research status (📋)

### `today.js` 📋 TODAY'S CHECKLIST
**Prioritized actionable tasks for the day**
```bash
node today.js
```
Shows: Meetings today, inbound leads (93% conv!), critical stale, daily habits with checkboxes.

### `digest.js` 🌅 MORNING DIGEST
**Everything you need to know in one command**
```bash
node digest.js
```
Shows: Pipeline, stale leads, top 5 priority, meetings, research files, Telegram summary

### `daily-ops.js` ⭐ FULL DAILY OPS
**The ONE command you need each morning**
```bash
node daily-ops.js
```
Shows:
- Pipeline snapshot
- Stale leads alert
- Top 5 follow-ups with ready emails
- Upcoming meetings
- Notable companies in pipeline
- Copy-paste Telegram summary

---

## 📧 Email Generation

### `quick-email.js`
**Generate follow-up emails instantly**
```bash
# Show top 10 leads
node quick-email.js --list

# Generate & copy email for specific lead
node quick-email.js olli.laamanen@rovio.com

# Export top N emails to file
node quick-email.js --top 10
```

### `generate-followup.js`
**Detailed email for single lead**
```bash
node generate-followup.js <email>
```

### `batch-followups.js`
**Generate multiple emails at once**
```bash
node batch-followups.js 10  # Top 10 leads
```

---

## 📈 Analysis & Reporting

### `lead-scorer.js`
**Priority scoring for all leads**
```bash
node lead-scorer.js
```
Scores based on:
- Days stale (max 40pts)
- Company notability (max 30pts)
- Lead category (max 30pts)
- Response time (max 10pts)

### `analyze-stale-leads.js`
**Deep dive on stale leads**
```bash
node analyze-stale-leads.js
```

### `weekly-report.js`
**Weekly performance tracking**
```bash
node weekly-report.js
```

### `weekly-trends.js`
**Track progress over time with goal tracking**
```bash
node weekly-trends.js
```
Shows: Current vs last week comparison, booking velocity, goal progress (30/month), recommendations.

### `source-analytics.js`
**Track which lead sources convert best**
```bash
node source-analytics.js
```
Shows: Conversion rates by source (Cold Email vs Inbound vs Reactivation), insights, recommendations.

### `quick-wins.js`
**Leads most likely to convert**
```bash
node quick-wins.js
```
Prioritizes: Inbound leads (93% conv rate) + Recent leads (<14 days). These are your highest probability closes.

### `morning-briefing.js`
**Telegram-ready daily summary**
```bash
node morning-briefing.js
```

### `research-lead.js`
**Generate research template for a lead**
```bash
node research-lead.js <email>
```
Creates a research file in `lead-research/` folder with template for personalizing outreach.

### `track-followup.js`
**Mark a lead as contacted**
```bash
node track-followup.js <email> [notes]
node track-followup.js olli@rovio.com "Sent re-engagement email"
```
Adds timestamped follow-up note to the lead record.

---

## 🔔 Monitoring

### `check-new-replies.js`
**Check for new positive replies**
```bash
node check-new-replies.js
```

---

## 📁 Output Files

| File | Contents |
|------|----------|
| `quick-emails.txt` | Ready-to-send follow-up emails |
| `batch-followups.json` | Generated emails with metadata |
| `scored-leads.json` | All leads with priority scores |
| `stale-leads-report.json` | Full stale leads analysis |
| `weekly-report.json` | Weekly stats |

---

## 📚 Reference Documents

| File | Purpose |
|------|---------|
| `follow-up-templates.md` | Email templates by urgency |
| `lead-gen-tools-research.md` | Apollo/Clay/Ocean.io comparison |
| `potential-leads-research.md` | Funded gaming startups to target |
| `hot-prospects-2025-2026.md` | Recently funded gaming companies (Feb 2026) |

---

## 🚀 Typical Workflow

### Every Morning
```bash
node daily-ops.js
```

### When Following Up
```bash
node quick-email.js --top 5
# Open quick-emails.txt and send
```

### Weekly Review
```bash
node weekly-report.js
```

### Check for New Leads
```bash
node check-new-replies.js
```

---

## 🌐 Dashboard

Access at: http://localhost:3456

Key views:
- **Response Times** - Performance analytics (default)
- **Interested Leads** - Full CRM with edit/delete, stale alerts
- **Bookings Tracker** - Upcoming meetings calendar + stats
- **🔥 Stale Leads** - Action center with one-click email generation
- **🚀 Hot Prospects** - Recently funded gaming companies
- **Campaigns** - Campaign overview and sequence analysis
- **Domain Health** - Email infrastructure status

API endpoints:
- `/api/dashboard-summary` - All key metrics in one call
- `/api/stale-leads` - Prioritized stale leads
- `/api/generate-followup/:email` - Generate follow-up email for a lead

---

## 🔔 Real-time Alerts (NEW)

### `realtime-alerts.js` 🚨 HOT LEAD ALERTS
**Monitors for new hot leads and triggers alerts**
```bash
# Single check
node realtime-alerts.js --once

# Continuous monitoring (every 5 min)
node realtime-alerts.js
```
Classifies leads into:
- 🔥 CRITICAL: Big companies (Unity, IGN, Naver, etc.)
- ⚡ HIGH: Meeting Request or Booked
- 📈 MEDIUM: Interested

---

## 📊 Strategic Analysis

### Files to Review
- `AUDIT-2026-02-04.md` - Full UI/Backend/Security audit
- `strategic-insights.md` - Business strategy recommendations

### Key Insight
**Inbound converts at 93.8% vs Cold Email at 21.3% (4.4x better!)**

Action: Focus on response time, not volume.

---

## 🔒 Security (Updated Feb 4)

The dashboard now includes:
- ✅ Localhost-only binding (127.0.0.1)
- ✅ Optional API key authentication (set DASHBOARD_API_KEY in .env)
- ✅ Rate limiting (100 req/min per IP)
- ✅ Response compression
- ✅ CORS restrictions in production

To enable API key auth:
```bash
echo "DASHBOARD_API_KEY=your-secret-key" >> .env
# Restart server
pkill -f "node.*server.js" && nohup node server.js > server.log 2>&1 &
```

---

## 🆕 NEW TOOLS (Feb 4, 2026)

### `daily-routine.js` ⭐ START HERE EVERY DAY
**Complete daily workflow in one command**
```bash
node daily-routine.js
```
Shows: Pipeline summary, alerts, priority actions, enterprise leads, daily checklist

### `auto-scheduler.js` 📧 FOLLOW-UP AUTOMATION
**Auto-generate follow-up emails based on lead age**
```bash
node auto-scheduler.js
```
Schedules: Day 1, 3, 7, 14 follow-ups with templates

### `lead-enrichment.js` 🔍 ENRICH LEADS
**Add company info, tier, and LinkedIn links to leads**
```bash
node lead-enrichment.js
```
Outputs: Tiered leads (Enterprise/Midmarket/Startup)

### `data-cleanup.js` 🧹 CLEAN DATA
**Fix duplicates and missing company names**
```bash
node data-cleanup.js           # Analyze only
node data-cleanup.js --fix     # Fix missing companies
node data-cleanup.js --dedupe  # Remove duplicates
```

### `smart-meeting-prep.js` 📋 MEETING PREP
**Generate comprehensive meeting prep docs**
```bash
node smart-meeting-prep.js nick.depalo@unity.com
```
Includes: Company intel, talking points, objection handling

### `email-performance.js` 📊 CAMPAIGN ANALYTICS
**Analyze campaign performance**
```bash
node email-performance.js
```
Shows: Best/worst campaigns, HyperTide vs Google comparison

### `telegram-digest.js` 📱 TELEGRAM SUMMARY
**Generate Telegram-formatted daily digest**
```bash
node telegram-digest.js
```
Copy-paste output directly to Telegram

### `competitor-intel.js` 🎯 COMPETITIVE INTEL
**Competitor analysis and battle cards**
```bash
node competitor-intel.js
```
Shows: Competitor landscape, pricing, positioning

---

## 📁 Tool Categories

| Category | Tools |
|----------|-------|
| **Daily Ops** | daily-routine.js, status.js, today.js |
| **Lead Management** | lead-enrichment.js, data-cleanup.js, lead-scorer.js |
| **Follow-ups** | auto-scheduler.js, batch-followups.js, quick-email.js |
| **Analytics** | email-performance.js, source-analytics.js, weekly-trends.js |
| **Meeting Prep** | smart-meeting-prep.js, meeting-prep.js |
| **Alerts** | realtime-alerts.js, check-new-replies.js |
| **Reporting** | morning-brief.js, telegram-digest.js, digest.js |
| **Research** | competitor-intel.js, research-lead.js |

---

## 🚀 Quick Start Flow

```bash
# 1. Morning routine
node daily-routine.js

# 2. Check for new hot leads
node check-new-replies.js

# 3. Prep for meetings
node smart-meeting-prep.js <email>

# 4. Generate follow-ups
node auto-scheduler.js

# 5. End of day digest
node telegram-digest.js
```
