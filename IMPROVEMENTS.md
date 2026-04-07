# SmartLead Dashboard - Fixes Applied (2026-02-02)

## ✅ FIXES APPLIED (22:42)

### 1. Warmup Stats - FIXED
**Problem:** `warmupSent` and `warmupReplied` always showed 0
**Cause:** SmartLead API returns `total_sent_count: 0` for all accounts (API limitation)
**Fix:** Now using `warmup_details.reply_rate` (e.g., 99%) as the real warmup health metric

### 2. Capacity & Utilization - NEW
Added metrics:
- `dailyCapacity`: Total emails/day capacity (2,658)
- `dailySent`: Today's actual sends (1,131)  
- `dailyUtilization`: 42.5%
- `weeklyCapacity` / `monthlyCapacity`
- Per-account: capacity, dailySent, utilization%

### 3. Data Sanity Checks - NEW
Dashboard now automatically flags suspicious data:
- ⚠️ Domains with active warmup but 0 campaign sends
- 🚨 Domains with high volume but 0 replies (statistically impossible)
- ⚠️ Low warmup reply rates (<70%)
- ⚠️ High bounce rates (>5%)
- 🚨 Zero values that shouldn't be zero

### 4. Warmup Reply Rate Breakdown - NEW
Added `byWarmupReplyRate` showing accounts by warmup health:
- excellent (>=90%): 60 accounts
- fair (50-70%): 414 accounts
- poor (<50%): 1 account

### 5. Data Issues Transparency
New `dataIssues` array in API response shows all flagged anomalies:
- Domain name, issue description, severity, suggested action

## ⚠️ KNOWN LIMITATIONS

### Time-Based Per-Domain Stats
**Wanted:** Daily, 7-day, 30-day stats per domain
**Status:** NOT POSSIBLE - SmartLead API doesn't support date filtering for mailbox-statistics
**Workaround:** Use `/api/trends` for aggregate daily stats; domain stats are all-time only

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/dashboard` | Main dashboard data (cached 5 min) |
| `GET /api/dashboard?force=true` | Force fresh data |
| `GET /api/warmup` | Domain health, warmup stats, capacity/utilization |
| `GET /api/warmup?force=true` | Force refresh warmup data |
| `GET /api/sequence-analysis` | Sequence step performance |
| `GET /api/verify` | Verify against SmartLead API |
| `GET /api/trends?days=30` | Day-wise aggregate trends |
| `GET /api/cache` | Cache statistics |
| `POST /api/cache/clear` | Clear all cache |
| `GET /api/health` | Health check |

## New /api/warmup Response Structure

```json
{
  "totalAccounts": 475,
  "capacity": {
    "dailyCapacity": 2658,
    "dailySent": 1131,
    "dailyUtilization": 42.5,
    "weeklyCapacity": 18606,
    "monthlyCapacity": 79740
  },
  "byWarmupReplyRate": {
    "excellent": 60,
    "good": 0,
    "fair": 414,
    "poor": 1
  },
  "dataIssues": [...],
  "bottlenecks": [...],
  "domainHealth": [...],
  "accountsByDomain": {...}
}
```

## Per-Account Data Now Includes

- `warmupReplyRate`: Real warmup health (0-100%)
- `dailyCapacity`: Emails/day limit
- `dailySent`: Today's sends
- `utilization`: % of capacity used

## Lessons Learned

1. **Always sanity check data before presenting**
   - Zero values that shouldn't be zero
   - Ratios that don't add up  
   - Numbers that are statistically impossible

2. **SmartLead API quirks**
   - `total_sent_count` in warmup_details is always 0
   - Use `reply_rate` instead for warmup health
   - Mailbox-statistics don't support date filtering

## Running the Server

```bash
cd ~/clawd/domain-health-dashboard
node server.js
# Dashboard at http://localhost:3456
```
