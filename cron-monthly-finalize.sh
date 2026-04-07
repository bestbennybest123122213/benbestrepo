#!/bin/bash
# Monthly Finalization Cron Job
# Run on the 1st of every month at 07:00 UTC
# Finalizes previous month's data
#
# Crontab entry:
# 0 7 1 * * /path/to/domain-health-dashboard/cron-monthly-finalize.sh >> /path/to/domain-health-dashboard/logs/cron-monthly-finalize.log 2>&1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/logs/cron-monthly-finalize.log"
SYNC_SCRIPT="$SCRIPT_DIR/smartlead-cli-sync.js"

# Ensure log directory exists
mkdir -p "$SCRIPT_DIR/logs"

echo ""
echo "=============================================="
echo "Monthly Finalization Started: $(date -u '+%Y-%m-%d %H:%M:%S') UTC"
echo "=============================================="

# Check if smartlead CLI is configured
if ! command -v smartlead &> /dev/null; then
    echo "[ERROR] smartlead CLI not found. Install with: npm install -g @smartlead/cli"
    exit 1
fi

# Run the sync script with finalize flag
cd "$SCRIPT_DIR"
node "$SYNC_SCRIPT" --finalize
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "[SUCCESS] Monthly finalization completed at $(date -u '+%Y-%m-%d %H:%M:%S') UTC"
    
    # Archive the monthly data with timestamp
    PREV_MONTH=$(date -u -d "yesterday" '+%Y-%m')
    cp "$SCRIPT_DIR/data/cli-monthly.json" "$SCRIPT_DIR/data/cli-monthly-${PREV_MONTH}-final.json" 2>/dev/null && \
        echo "[ARCHIVE] Created archive: cli-monthly-${PREV_MONTH}-final.json"
else
    echo "[ERROR] Monthly finalization failed with exit code $EXIT_CODE"
fi

echo "=============================================="
echo ""
