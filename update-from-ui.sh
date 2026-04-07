#!/bin/bash
# Update global-analytics.json with exact values from SmartLead UI
# Run this after browser scraping to update bounced value

# Usage: ./update-from-ui.sh <bounced_value>
# Example: ./update-from-ui.sh 276

if [ -z "$1" ]; then
  echo "Usage: ./update-from-ui.sh <bounced_value>"
  echo "Get the bounced value from SmartLead Global Analytics UI"
  exit 1
fi

BOUNCED=$1
DATA_FILE="data/global-analytics.json"

if [ ! -f "$DATA_FILE" ]; then
  echo "Error: $DATA_FILE not found"
  exit 1
fi

# Update bounced in last30d
jq ".ranges.last30d.bounced = $BOUNCED" "$DATA_FILE" > /tmp/ga-temp.json && mv /tmp/ga-temp.json "$DATA_FILE"

echo "✅ Updated last30d bounced to $BOUNCED"
cat "$DATA_FILE" | jq '.ranges.last30d | {sent, replied, positive, bounced}'
