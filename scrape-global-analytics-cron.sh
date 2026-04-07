#!/bin/bash
# SmartLead Global Analytics Scraper - Cron Runner
# Add to crontab: 0 6 * * * /path/to/scrape-global-analytics-cron.sh
# Runs at 6 AM daily

cd "$(dirname "$0")"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting global analytics scrape..."

# Run the scraper with verbose logging
node scrape-global-analytics.js --verbose >> /tmp/global-analytics-scrape.log 2>&1

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Scrape completed successfully"
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Scrape failed with exit code $EXIT_CODE"
fi

exit $EXIT_CODE
