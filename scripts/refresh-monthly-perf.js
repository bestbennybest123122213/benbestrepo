#!/usr/bin/env node
/**
 * Refresh Monthly Domain & Account Performance
 *
 * PRESERVES existing data for NOV-FEB (Jan's verified Google Sheet export).
 * Only refreshes MAR onward using Smartlead API proportional estimates.
 * Automatically adds new months (APR, MAY, etc.) as time progresses.
 *
 * Outputs:
 *   data/domain-monthly-perf.json  (domain-level monthly breakdown)
 *   data/account-monthly-perf.json (account-level monthly breakdown)
 *
 * Usage:
 *   node scripts/refresh-monthly-perf.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';
const DATA_DIR = path.join(__dirname, '../data');

// Months where Jan's Google Sheet data is the source of truth — do NOT overwrite
const PRESERVED_MONTHS = new Set(['NOV', 'DEC', 'JAN', 'FEB']);

const delay = ms => new Promise(r => setTimeout(r, ms));
const log = msg => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

async function apiRequest(endpoint, retries = 3) {
  const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) { await delay(30000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await delay(2000 * attempt);
    }
  }
}

// Get month ranges that need refreshing (MAR 2026 onward through current month)
function getRefreshMonthRanges() {
  const ranges = [];
  const now = new Date();
  let year = 2026, month = 2; // March (0-indexed)

  while (year < now.getFullYear() || (year === now.getFullYear() && month <= now.getMonth())) {
    const start = new Date(Date.UTC(year, month, 1));
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const end = isCurrentMonth ? now : new Date(Date.UTC(year, month + 1, 0));

    const labels = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    ranges.push({
      label: labels[month],
      year,
      month,
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      isCurrent: isCurrentMonth
    });

    month++;
    if (month > 11) { month = 0; year++; }
  }
  return ranges;
}

async function getDayWiseStats(startDate, endDate) {
  const data = await apiRequest(`/analytics/day-wise-overall-stats?start_date=${startDate}&end_date=${endDate}`);
  const days = data?.data?.day_wise_stats || data?.day_wise_stats || [];
  const totals = { sent: 0, replied: 0, bounced: 0 };
  for (const day of days) {
    totals.sent += day.email_engagement_metrics?.sent || 0;
    totals.replied += day.email_engagement_metrics?.replied || 0;
    totals.bounced += day.email_engagement_metrics?.bounced || 0;
  }
  return totals;
}

async function getMailboxStats() {
  const campaigns = await apiRequest('/campaigns/');
  const active = campaigns.filter(c => ['ACTIVE','COMPLETED','PAUSED','STOPPED'].includes(c.status));
  log(`Processing ${active.length} campaigns for mailbox stats...`);

  const emailStats = {};

  for (let i = 0; i < active.length; i++) {
    if ((i + 1) % 20 === 0) log(`  Campaign ${i + 1}/${active.length}`);
    try {
      const res = await apiRequest(`/campaigns/${active[i].id}/mailbox-statistics`);
      const stats = res?.data || res || [];
      for (const s of stats) {
        const email = s.from_email;
        if (!email) continue;
        if (!emailStats[email]) {
          emailStats[email] = { email, domain: email.split('@')[1], sent: 0, replies: 0, bounced: 0 };
        }
        emailStats[email].sent += parseInt(s.sent_count) || 0;
        emailStats[email].replies += parseInt(s.reply_count) || 0;
        emailStats[email].bounced += parseInt(s.bounce_count) || 0;
      }
    } catch (e) { /* skip failed campaigns */ }
    await delay(150);
  }

  return emailStats;
}

async function main() {
  if (!API_KEY) {
    console.error('Missing SMARTLEAD_API_KEY');
    process.exit(1);
  }

  const domainPath = path.join(DATA_DIR, 'domain-monthly-perf.json');
  const accountPath = path.join(DATA_DIR, 'account-monthly-perf.json');

  let existingDomainData = {};
  let existingAccountData = {};
  try {
    if (fs.existsSync(domainPath)) existingDomainData = JSON.parse(fs.readFileSync(domainPath, 'utf8'));
    if (fs.existsSync(accountPath)) existingAccountData = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
    log(`Loaded existing data: ${Object.keys(existingDomainData).length} domains, ${Object.keys(existingAccountData).length} accounts`);
  } catch (e) {
    log(`Could not load existing data: ${e.message}`);
  }

  const refreshMonths = getRefreshMonthRanges();
  log(`Months to refresh: ${refreshMonths.map(m => m.label).join(', ')}`);
  log(`Preserved months (Jan's data): ${[...PRESERVED_MONTHS].join(', ')}`);

  log('Fetching day-wise stats for refresh months...');
  const monthlyOverall = {};
  for (const m of refreshMonths) {
    monthlyOverall[m.label] = await getDayWiseStats(m.start, m.end);
    log(`  ${m.label}${m.isCurrent ? ' (partial)' : ''}: ${monthlyOverall[m.label].sent} sent, ${monthlyOverall[m.label].replied} replied`);
    await delay(300);
  }

  log('Fetching mailbox statistics...');
  const emailStats = await getMailboxStats();
  const emails = Object.values(emailStats);
  log(`Got stats for ${emails.length} email accounts`);

  const totalLifetime = emails.reduce((acc, e) => {
    acc.sent += e.sent;
    acc.replies += e.replies;
    return acc;
  }, { sent: 0, replies: 0 });

  const domainMonthly = {};
  const accountMonthly = {};

  for (const email of emails) {
    const proportion = totalLifetime.sent > 0 ? email.sent / totalLifetime.sent : 0;
    const replyProportion = totalLifetime.replies > 0 ? email.replies / totalLifetime.replies : 0;

    const existingAcct = existingAccountData[email.email];
    const months = {};

    if (existingAcct && existingAcct.months) {
      for (const label of PRESERVED_MONTHS) {
        if (existingAcct.months[label]) {
          months[label] = { ...existingAcct.months[label] };
        }
      }
    }

    for (const m of refreshMonths) {
      const overall = monthlyOverall[m.label];
      const sent = Math.round(overall.sent * proportion);
      const replies = Math.round(overall.replied * replyProportion);
      months[m.label] = {
        sent,
        replies,
        reply_rate: sent > 0 ? parseFloat((replies / sent * 100).toFixed(2)) : 0
      };
    }

    const totalSent = Object.values(months).reduce((s, m) => s + (m.sent || 0), 0);
    const totalReplies = Object.values(months).reduce((s, m) => s + (m.replies || 0), 0);

    accountMonthly[email.email] = {
      domain: email.domain,
      months,
      total_sent: totalSent,
      total_replies: totalReplies,
      total_reply_rate: totalSent > 0 ? parseFloat((totalReplies / totalSent * 100).toFixed(2)) : 0
    };

    if (!domainMonthly[email.domain]) {
      domainMonthly[email.domain] = {};
    }

    for (const [label, mData] of Object.entries(months)) {
      if (!domainMonthly[email.domain][label]) {
        domainMonthly[email.domain][label] = { sent: 0, replies: 0, accounts: 0, reply_rate: 0 };
      }
      domainMonthly[email.domain][label].sent += mData.sent || 0;
      domainMonthly[email.domain][label].replies += mData.replies || 0;
      domainMonthly[email.domain][label].accounts++;
    }
  }

  for (const [domain, oldData] of Object.entries(existingDomainData)) {
    if (!domainMonthly[domain]) {
      domainMonthly[domain] = {};
      for (const [label, mData] of Object.entries(oldData)) {
        if (PRESERVED_MONTHS.has(label)) {
          domainMonthly[domain][label] = { ...mData };
        }
      }
    } else {
      for (const label of PRESERVED_MONTHS) {
        if (!domainMonthly[domain][label] && oldData[label]) {
          domainMonthly[domain][label] = { ...oldData[label] };
        }
      }
    }
  }

  for (const domain of Object.keys(domainMonthly)) {
    for (const [label, d] of Object.entries(domainMonthly[domain])) {
      d.reply_rate = d.sent > 0 ? parseFloat((d.replies / d.sent * 100).toFixed(2)) : 0;
    }
  }

  fs.writeFileSync(domainPath, JSON.stringify(domainMonthly, null, 2));
  fs.writeFileSync(accountPath, JSON.stringify(accountMonthly, null, 2));

  log(`Saved ${Object.keys(domainMonthly).length} domains to ${domainPath}`);
  log(`Saved ${Object.keys(accountMonthly).length} accounts to ${accountPath}`);

  console.log('\n=== Monthly Summary ===');
  const allMonthLabels = [...PRESERVED_MONTHS, ...refreshMonths.map(m => m.label)];
  for (const label of allMonthLabels) {
    if (PRESERVED_MONTHS.has(label)) {
      console.log(`${label}: [preserved from Jan's data]`);
    } else {
      const o = monthlyOverall[label];
      if (o) {
        const isCurrent = refreshMonths.find(m => m.label === label)?.isCurrent;
        console.log(`${label}${isCurrent ? ' (partial)' : ''}: ${o.sent} sent | ${o.replied} replied | ${(o.sent > 0 ? (o.replied/o.sent*100) : 0).toFixed(2)}%`);
      }
    }
  }
  console.log(`\nDomains: ${Object.keys(domainMonthly).length} | Accounts: ${Object.keys(accountMonthly).length}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
