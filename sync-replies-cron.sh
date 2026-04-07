#!/bin/bash
# Reply Sync Wrapper for Cron Jobs
# Uses --quick flag to prevent timeouts
# Created: 2026-02-14 22:00

cd "$(dirname "$0")"
node sync-all-replies.js --quick 2>&1
