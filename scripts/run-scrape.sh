#!/bin/bash
# Run domain stats scraper
# Usage: ./scripts/run-scrape.sh

cd "$(dirname "$0")/.."

echo "Domain Stats Scraper"
echo "===================="
echo ""

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js not found"
    exit 1
fi

# Run the scraper setup
node scripts/scrape-domain-stats.js

echo ""
echo "Note: Actual browser scraping must be triggered via clawd session."
echo "The browser automation will use memory/SMARTLEAD-DATE-PICKER.md method."
