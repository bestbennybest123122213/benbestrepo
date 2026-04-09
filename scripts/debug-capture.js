#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

async function main() {
  if (!API_KEY) { console.error('Missing SMARTLEAD_API_KEY'); process.exit(1); }
  console.log('API key length:', API_KEY.length);

  console.log('\n=== FETCHING CAMPAIGNS ===');
  const res = await fetch(`${BASE_URL}/campaigns/?api_key=${API_KEY}`);
  const campaigns = await res.json();

  if (!Array.isArray(campaigns)) {
    console.error('ERROR: non-array response:', JSON.stringify(campaigns).slice(0, 200));
    process.exit(1);
  }

  console.log('Total campaigns:', campaigns.length);

  const statusCounts = {};
  campaigns.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });
  console.log('By status:', JSON.stringify(statusCounts));

  const brokenFilter = campaigns.filter(c => ['ACTIVE', 'COMPLETED', 'PAUSED'].includes(c.status));
  console.log('Broken filter (ACTIVE/COMPLETED/PAUSED):', brokenFilter.length);

  const correctFilter = campaigns.filter(c => !c.parent_campaign_id && c.status !== 'DRAFTED');
  console.log('Correct filter (all except DRAFTED, no sub-campaigns):', correctFilter.length);

  console.log('\n=== TESTING MAILBOX STATS (first 5 campaigns) ===');
  const testCampaigns = correctFilter.slice(0, 5);
  let totalStats = 0;

  for (const campaign of testCampaigns) {
    try {
      const statsRes = await fetch(`${BASE_URL}/campaigns/${campaign.id}/mailbox-statistics?api_key=${API_KEY}`);
      const data = await statsRes.json();
      const stats = data?.data || data || [];
      const statCount = Array.isArray(stats) ? stats.length : 0;
      let sent = 0, replies = 0;
      if (Array.isArray(stats)) {
        stats.forEach(s => { sent += parseInt(s.sent_count) || 0; replies += parseInt(s.reply_count) || 0; });
      }
      totalStats += statCount;
      console.log(`  Campaign ${campaign.id} "${campaign.name}" [${campaign.status}]: ${statCount} mailboxes, ${sent} sent, ${replies} replies`);
    } catch (e) {
      console.log(`  Campaign ${campaign.id}: ERROR - ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nTotal mailbox entries from ${testCampaigns.length} campaigns: ${totalStats}`);
  if (totalStats === 0) {
    console.log('WARNING: Zero stats. API key may lack access or endpoint format changed.');
  } else {
    console.log('SUCCESS: Mailbox stats working. Capture script campaign filter was the issue.');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
