#!/bin/bash
#
# SmartLead UI Scraper - Cron Wrapper
# THE GOLD STANDARD for accurate dashboard data
#
# Runs at:
#   - 1am EST (7am Warsaw/CET)  
#   - 5pm EST (11pm Warsaw/CET)
#
# Crontab entries (Warsaw time):
#   0 7 * * * /Users/ben/clawd/domain-health-dashboard/cron-ui-scrape.sh
#   0 23 * * * /Users/ben/clawd/domain-health-dashboard/cron-ui-scrape.sh

cd /Users/ben/clawd/domain-health-dashboard

# Log file
LOG_DIR="logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/ui-scrape-$(date +%Y-%m-%d).log"

echo "========================================" >> "$LOG_FILE"
echo "Starting UI scrape at $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

# Run the scraper
/opt/homebrew/bin/node cron-ui-scrape.js >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "Scrape completed successfully at $(date)" >> "$LOG_FILE"
    
    # Restart server to pick up new data
    pkill -f "node server.js" 2>/dev/null
    sleep 2
    nohup /opt/homebrew/bin/node server.js >> logs/server.log 2>&1 &
    echo "Server restarted to load new data" >> "$LOG_FILE"
else
    echo "Scrape FAILED with exit code $EXIT_CODE at $(date)" >> "$LOG_FILE"
    
    # Optional: Send alert via Telegram
    # curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    #   -d "chat_id=$TELEGRAM_CHAT_ID" \
    #   -d "text=⚠️ SmartLead UI scrape failed at $(date)"
fi

echo "" >> "$LOG_FILE"

# Clean up old logs (keep last 7 days)
find "$LOG_DIR" -name "ui-scrape-*.log" -mtime +7 -delete 2>/dev/null

exit $EXIT_CODE
