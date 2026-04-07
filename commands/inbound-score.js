#!/usr/bin/env node
/**
 * Inbound Score
 * Single score (0-100) measuring inbound growth activity.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8')); }
  catch { return {}; }
}

function daysSince(dateStr) {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

async function main() {
  let score = 0;
  const breakdown = [];

  // 1. Referrals (0-30 points)
  const referrals = loadJSON('referrals.json');
  const asksLast30 = (referrals.asks || []).filter(a => daysSince(a.date) <= 30).length;
  const receivedLast30 = (referrals.received || []).filter(a => daysSince(a.date) <= 30).length;
  
  let refScore = 0;
  if (asksLast30 >= 3) refScore += 15;
  else if (asksLast30 >= 1) refScore += 5;
  if (receivedLast30 >= 1) refScore += 15;
  
  score += refScore;
  breakdown.push({ name: 'Referrals', score: refScore, max: 30, 
    detail: `${asksLast30} asks, ${receivedLast30} received (30d)` });

  // 2. Content/LinkedIn (0-30 points)
  const content = loadJSON('content-calendar.json');
  const postsLast30 = (content.posts || []).filter(p => daysSince(p.date) <= 30).length;
  const postsLast7 = (content.posts || []).filter(p => daysSince(p.date) <= 7).length;
  
  let contentScore = 0;
  if (postsLast7 >= 1) contentScore += 15;
  if (postsLast30 >= 4) contentScore += 15;
  else if (postsLast30 >= 2) contentScore += 8;
  
  score += contentScore;
  breakdown.push({ name: 'Content', score: contentScore, max: 30,
    detail: `${postsLast7} this week, ${postsLast30} this month` });

  // 3. Industry Presence (0-20 points)
  const presence = loadJSON('presence.json');
  const now = new Date();
  const currentQ = Math.floor(now.getMonth() / 3) + 1;
  const thisQuarter = (presence.appearances || []).filter(a => {
    const d = new Date(a.date);
    return d.getFullYear() === now.getFullYear() && 
           Math.floor(d.getMonth() / 3) + 1 === currentQ;
  }).length;
  
  let presenceScore = thisQuarter >= 1 ? 20 : 0;
  score += presenceScore;
  breakdown.push({ name: 'Presence', score: presenceScore, max: 20,
    detail: `${thisQuarter} appearances Q${currentQ}` });

  // 4. Activity Recency (0-20 points)
  const lastAsk = (referrals.asks || []).slice(-1)[0]?.date;
  const lastPost = content.lastPost;
  const lastAppearance = (presence.appearances || []).slice(-1)[0]?.date;
  
  let recencyScore = 0;
  if (lastAsk && daysSince(lastAsk) <= 7) recencyScore += 7;
  if (lastPost && daysSince(lastPost) <= 7) recencyScore += 7;
  if (lastAppearance && daysSince(lastAppearance) <= 30) recencyScore += 6;
  
  score += recencyScore;
  breakdown.push({ name: 'Recency', score: recencyScore, max: 20,
    detail: 'Recent activity bonus' });

  // Display
  console.log('\n📊 INBOUND SCORE');
  console.log('═'.repeat(50));
  
  const emoji = score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴';
  console.log(`\n${emoji} ${score}/100`);
  
  if (score >= 70) console.log('   Great inbound activity. Keep it up.');
  else if (score >= 40) console.log('   Decent activity. Room to improve.');
  else console.log('   Low inbound activity. Focus on referrals + content.');

  console.log('\nBreakdown:');
  breakdown.forEach(b => {
    const bar = '█'.repeat(Math.floor(b.score / b.max * 10)) + 
                '░'.repeat(10 - Math.floor(b.score / b.max * 10));
    console.log(`  ${b.name.padEnd(10)} ${bar} ${b.score}/${b.max} (${b.detail})`);
  });

  console.log('\nBoost your score:');
  if (asksLast30 < 3) console.log('  → Ask 3 clients for referrals this month');
  if (postsLast7 < 1) console.log('  → Post on LinkedIn this week');
  if (thisQuarter < 1) console.log('  → Get on a podcast this quarter');
}

main().catch(console.error);
