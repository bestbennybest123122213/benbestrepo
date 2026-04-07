#!/bin/bash
# SmartLead → Supabase Daily Sync
# 
# Add to crontab for daily runs:
#   0 5 * * * /Users/ben/clawd/domain-health-dashboard/cron-sync-smartlead.sh >> /tmp/smartlead-sync.log 2>&1
#
# This syncs all SmartLead data to Supabase for Bull OS dashboard.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "SmartLead Sync: $(date)"
echo "========================================"

# Step 1: Scrape latest Global Analytics
echo "[1/3] Scraping Global Analytics..."
node scrape-global-analytics.js

# Step 2: Sync to Supabase (today + missing days in last 30)
echo ""
echo "[2/3] Syncing to Supabase..."
node sync-smartlead-to-supabase.js

# Step 3: Verify accuracy (optional, for debugging)
# echo ""
# echo "[3/3] Verifying..."
# node verify-smartlead-ui.js

echo ""
echo "✅ Sync complete: $(date)"
echo "========================================"
