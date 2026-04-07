#!/bin/bash
# Daily CLI Sync Cron Job
# Run at 06:00 UTC (08:00 Warsaw time)
# Updates both time-based and monthly data from Smartlead CLI
#
# Crontab entry:
# 0 6 * * * /path/to/domain-health-dashboard/cron-cli-sync.sh >> /path/to/domain-health-dashboard/logs/cron-cli-sync.log 2>&1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/logs/cron-cli-sync.log"
SYNC_SCRIPT="$SCRIPT_DIR/smartlead-cli-sync.js"

# Ensure log directory exists
mkdir -p "$SCRIPT_DIR/logs"

echo ""
echo "=============================================="
echo "CLI Sync Cron Job Started: $(date -u '+%Y-%m-%d %H:%M:%S') UTC"
echo "=============================================="

# Check if smartlead CLI is configured
if ! command -v smartlead &> /dev/null; then
    echo "[ERROR] smartlead CLI not found. Install with: npm install -g @smartlead/cli"
    exit 1
fi

# Run the sync scripts
cd "$SCRIPT_DIR"

echo "[STEP 1] Running time-based/monthly CLI sync..."
node "$SYNC_SCRIPT"
SYNC_EXIT=$?

echo "[STEP 2] Running domain health CLI sync..."
node "$SCRIPT_DIR/domain-health-cli.js"
DOMAIN_EXIT=$?

if [ $SYNC_EXIT -eq 0 ] && [ $DOMAIN_EXIT -eq 0 ]; then
    echo "[SUCCESS] All CLI syncs completed at $(date -u '+%Y-%m-%d %H:%M:%S') UTC"
else
    echo "[WARNING] Some syncs had issues:"
    [ $SYNC_EXIT -ne 0 ] && echo "  - smartlead-cli-sync.js failed (exit $SYNC_EXIT)"
    [ $DOMAIN_EXIT -ne 0 ] && echo "  - domain-health-cli.js failed (exit $DOMAIN_EXIT)"
fi

echo "=============================================="
echo ""
