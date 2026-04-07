# BULL OS Dashboard Automation — Smartlead CLI Instructions

## Overview

Automate the BULL OS dashboard (https://bull-os-production.up.railway.app/) by pulling data from Smartlead via CLI and writing it to Supabase. Two dashboard sections need automation:

1. **Time-Based Performance** — updated daily via cron
2. **Month-by-Month Performance** — current month updated daily, past months finalized on the 1st

---

## Prerequisites

```bash
npm install -g @smartlead/cli
smartlead config set api_key $SMARTLEAD_API_KEY
```

---

## Data Sources — Which CLI Command for Each Metric

We tested every available CLI command against the Smartlead UI. Here are the exact commands that produce matching numbers.

### Sent, Replied

**Command:** `smartlead analytics daily-sent`

This groups data by the date the original email was sent. Summing `replied` from this command gives the exact reply count matching the Smartlead UI (149 = 149, exact match).

```bash
smartlead analytics daily-sent --from YYYY-MM-DD --to YYYY-MM-DD --timezone UTC --format json
```

**Response structure:**
```json
{
  "data": {
    "day_wise_stats": [
      {
        "date": "2 Mar",
        "day_name": "Monday",
        "email_engagement_metrics": {
          "sent": "1272",
          "opened": "10",
          "replied": "11",
          "bounced": "13",
          "unsubscribed": "0",
          "unique_lead_reached": "1272"
        }
      }
    ]
  }
}
```

**Extract:** Sum `sent` and `replied` across all days in the response.

**Important:** Values may be strings or numbers. Always parse with `parseInt()` or equivalent.

**NOTE:** `unique_lead_reached` is buggy - returns same value as `sent`. DO NOT USE for contacts.

---

### Leads Contacted

**Command:** `smartlead analytics lead-stats`

This gives the actual unique leads contacted across the date range.

```bash
smartlead analytics lead-stats --from YYYY-MM-DD --to YYYY-MM-DD --format json
```

**Response structure:**
```json
{
  "data": {
    "lead_stats": {
      "count": {
        "total": 2278,
        "new": 719,
        "follow_up": 1559
      }
    }
  }
}
```

**Extract:** Use `data.lead_stats.count.total` for leads contacted.

---

### Bounced

**Command:** `smartlead analytics daily`

This groups data by the date the event occurred (not the date the email was sent). Summing `bounced` from this command gives the exact bounce count matching the Smartlead UI (256 = 256, exact match).

```bash
smartlead analytics daily --from YYYY-MM-DD --to YYYY-MM-DD --format json
```

**Response structure:**
```json
{
  "data": {
    "day_wise_stats": [
      {
        "date": "2 Mar",
        "day_name": "Monday",
        "email_engagement_metrics": {
          "sent": 1272,
          "opened": 10,
          "replied": 10,
          "bounced": 13,
          "unsubscribed": 0
        }
      }
    ]
  }
}
```

**Extract:** Sum `bounced` across all days.

**Do NOT use `daily-sent` for bounced** — it gives 258 instead of 256.

---

### Positive Responses

**Command:** `smartlead analytics daily-replies-sent`

This gives `positive_replied` per day grouped by the date the original email was sent. Summing gives 26 for the last 30 days (UI shows 25, off by 1 — the closest any CLI command gets).

For shorter time windows (7 days, 14 days), this command matches the UI exactly.

The +1 variance on 30-day windows is caused by Smartlead internally double-counting a lead whose status changed from "Interested" to "Booked" — the API counts both events, the UI deduplicates.

```bash
smartlead analytics daily-replies-sent --from YYYY-MM-DD --to YYYY-MM-DD --timezone UTC --format json
```

**Response structure:**
```json
{
  "data": {
    "day_wise_stats": [
      {
        "date": "2 Mar",
        "day_name": "Monday",
        "email_engagement_metrics": {
          "positive_replied": "1"
        }
      }
    ]
  }
}
```

**Extract:** Sum `positive_replied` across all days.

**Important:** Values may be `0` (number) or `"1"` (string). Always handle both types.

**Positive categories include:** Meeting Request, Information Request, Interested, and Booked. These are all categorized as `sentiment_type: "positive"` in Smartlead. Booked is a status that replaces Interested when a meeting is confirmed — it should count as one positive response, not two.

---

## Summary Table

| Metric | CLI Command | Field to Extract | Accuracy |
|--------|------------|------------------|----------|
| Leads Contacted | `analytics lead-stats` | `data.lead_stats.count.total` | Exact |
| Sent | `analytics daily-sent` | sum `sent` | Exact |
| Replied | `analytics daily-sent` | sum `replied` | Exact |
| Bounced | `analytics daily` | sum `bounced` | Exact |
| Positive | `analytics daily-replies-sent` | sum `positive_replied` | Exact on 7d/14d, off by max 1 on 30d+ |

**Total CLI calls needed: 4 per time window.**

---

## Section 1: Time-Based Performance

### Time Windows

Calculate these relative to today's date. "Last business day" = the most recent weekday (Mon-Fri). If today is Monday, last business day is Friday. If today is Saturday, last business day is Friday. If today is Tuesday, last business day is Monday.

| Row | From | To |
|-----|------|----|
| Last Business Day | last weekday | last weekday |
| Last 3 Days | today - 2 | today |
| Last 7 Days | today - 6 | today |
| Last 14 Days | today - 13 | today |
| Last 30 Days | today - 29 | today |
| Last 60 Days | today - 59 | today |
| Last 90 Days | today - 89 | today |
| Last 120 Days | today - 119 | today |

### Exact CLI Commands (Example for March 30, 2026)

**Last 7 Days:**
```bash
smartlead analytics daily-sent --from 2026-03-24 --to 2026-03-30 --timezone UTC --format json
smartlead analytics daily --from 2026-03-24 --to 2026-03-30 --format json
smartlead analytics daily-replies-sent --from 2026-03-24 --to 2026-03-30 --timezone UTC --format json
smartlead analytics lead-stats --from 2026-03-24 --to 2026-03-30 --format json
```

### Percentage Changes

For each window, calculate the % change compared to the previous equivalent period:
- Last 7 Days current = Mar 24 - Mar 30
- Last 7 Days previous = Mar 17 - Mar 23
- % change = ((current - previous) / previous) * 100

Color coding: positive % = green, negative % = red.

### Daily Cron Job

Run once per day. Recommended time: 06:00 UTC (08:00 Warsaw time, before work starts).

```
0 6 * * * /path/to/bull-os-daily-update.sh
```

---

## Section 2: Month-by-Month Performance

### Months to Track

| Month | From | To |
|-------|------|----|
| November 2025 | 2025-11-01 | 2025-11-30 |
| December 2025 | 2025-12-01 | 2025-12-31 |
| January 2026 | 2026-01-01 | 2026-01-31 |
| February 2026 | 2026-02-01 | 2026-02-28 |
| March 2026 | 2026-03-01 | 2026-03-31 |
| April 2026 (when it starts) | 2026-04-01 | today |

### Cron Logic

**Daily cron (same job as time-based, runs at 06:00 UTC):**
- Updates the current month row only
- `--from` = first day of current month
- `--to` = today's date
- Does NOT touch past months

**Monthly cron (runs on the 1st of every month at 07:00 UTC):**
- Finalizes the previous month with its complete data
- Writes final numbers that will never change again
- Starts tracking the new month from day 1

```
# Daily: update current month + time-based (every day at 06:00 UTC)
0 6 * * * /path/to/bull-os-daily-update.sh

# Monthly: finalize previous month (1st of every month at 07:00 UTC)
0 7 1 * * /path/to/bull-os-monthly-finalize.sh
```

---

## Quick Reference: All 4 CLI Commands

```bash
# Command 1 — gives: sent, replied
smartlead analytics daily-sent --from FROM --to TO --timezone UTC --format json

# Command 2 — gives: bounced
smartlead analytics daily --from FROM --to TO --format json

# Command 3 — gives: positive
smartlead analytics daily-replies-sent --from FROM --to TO --timezone UTC --format json

# Command 4 — gives: leads_contacted
smartlead analytics lead-stats --from FROM --to TO --format json
```

Replace FROM and TO with the appropriate date range for each time window or month.

---

## Known Variance

| Metric | Max variance vs UI | Cause |
|--------|-------------------|-------|
| Sent | 0 | Exact match |
| Replied | 0 | Exact match (using daily-sent) |
| Bounced | 0 | Exact match (using analytics daily) |
| Positive | 0-1 on 30d+ windows | API double-counts leads whose status changed from Interested to Booked |
| Leads Contacted | 0 | Exact match (using lead-stats, verified: 2,278 = 2,278) |
