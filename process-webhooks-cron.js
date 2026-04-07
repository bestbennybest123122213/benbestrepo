#!/usr/bin/env node
/**
 * Cron job to process incoming webhooks and generate drafts
 * Run every minute via cron
 */

const { processAllPending } = require('./auto-reply-drafter');

async function main() {
  console.log(`[${new Date().toISOString()}] Processing webhooks...`);
  
  try {
    const results = await processAllPending();
    
    if (results.length === 0) {
      console.log('No pending webhooks');
    } else {
      console.log(`Processed ${results.length} webhooks:`);
      results.forEach(r => {
        console.log(`  - ${r.email}: ${r.category} → ${r.action}`);
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
