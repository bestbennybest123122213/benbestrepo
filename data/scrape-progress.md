# Smartlead Domain Health Scrape - Progress Report

**Date:** March 17, 2026
**Status:** Partial Complete

## Completed
- ✅ 7-day data (Mar 10-16): 470 accounts scraped
- ✅ 14-day data (Mar 3-16): 470 accounts scraped

## Pending
- ⏳ 30-day data (Feb 15 - Mar 16)
- ⏳ 60-day data (Jan 16 - Mar 16)
- ⏳ 90-day data (Dec 17, 2025 - Mar 16)

## Data Structure
Each scraped period contains:
- `email`: Account email address
- `leadContacted`: Number of leads contacted
- `emailSent`: Total emails sent
- `opened`: { percent, count }
- `replied`: { percent, count }
- `positiveReply`: { percent, count }
- `bounce`: { percent, count }

## Domains Found (sample)
From the data, domains include:
- itss-imannntvsite.com (HyperTide)
- itss-imannntvcloud.com (HyperTide)
- itssimannntv.com (HyperTide)
- Various other itss/imannntv variants

## Processing Script
Created: `/Users/ben/clawd/domain-health-dashboard/data/scrape-smartlead.js`
- Aggregates accounts by domain
- Detects provider (HyperTide/Google)
- Calculates percentages

## Next Steps
1. Continue scraping 30d, 60d, 90d periods
2. Run processing script to aggregate
3. Update dashboard data file
