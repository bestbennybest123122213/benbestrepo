#!/usr/bin/env node
/**
 * Smart Follow-up Scheduler
 * 
 * Uses heuristics to determine optimal follow-up timing:
 * - Time zones
 * - Day of week
 * - Lead priority
 * - Response patterns
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

// Optimal send times (in target timezone)
const OPTIMAL_TIMES = {
  enterprise: ['09:00', '10:00', '14:00'],  // Business hours
  'mid-market': ['09:00', '11:00', '15:00'],
  smb: ['08:00', '10:00', '16:00'],
  default: ['09:00', '14:00']
};

// Best days for outreach
const BEST_DAYS = ['Tuesday', 'Wednesday', 'Thursday'];
const GOOD_DAYS = ['Monday', 'Friday'];

// Time zone mapping (simplified)
const TZ_MAP = {
  'com': 'America/New_York',
  'co.uk': 'Europe/London',
  'de': 'Europe/Berlin',
  'fr': 'Europe/Paris',
  'jp': 'Asia/Tokyo',
  'au': 'Australia/Sydney',
  'in': 'Asia/Kolkata',
  'se': 'Europe/Stockholm',
  'kr': 'Asia/Seoul'
};

function guessTimezone(email) {
  const domain = email.split('@')[1];
  const tld = domain.split('.').slice(-1)[0];
  const tld2 = domain.split('.').slice(-2).join('.');
  return TZ_MAP[tld2] || TZ_MAP[tld] || 'America/New_York';
}

function getNextOptimalTime(lead, tier) {
  const now = new Date();
  const times = OPTIMAL_TIMES[tier] || OPTIMAL_TIMES.default;
  
  // Find next best day
  let targetDate = new Date(now);
  const dayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
  
  // If it's a weekend or late Friday, move to Monday/Tuesday
  const dayNum = targetDate.getDay();
  if (dayNum === 0) targetDate.setDate(targetDate.getDate() + 2); // Sun -> Tue
  else if (dayNum === 6) targetDate.setDate(targetDate.getDate() + 3); // Sat -> Tue
  else if (dayNum === 5 && now.getHours() > 12) targetDate.setDate(targetDate.getDate() + 4); // Fri PM -> Tue
  
  // Pick a random optimal time
  const time = times[Math.floor(Math.random() * times.length)];
  const [hours, mins] = time.split(':').map(Number);
  targetDate.setHours(hours, mins, 0, 0);
  
  // If time has passed today, move to tomorrow
  if (targetDate <= now) {
    targetDate.setDate(targetDate.getDate() + 1);
    // Check if tomorrow is weekend
    const nextDayNum = targetDate.getDay();
    if (nextDayNum === 0) targetDate.setDate(targetDate.getDate() + 1);
    if (nextDayNum === 6) targetDate.setDate(targetDate.getDate() + 2);
  }
  
  return targetDate;
}

async function generateSchedule() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .neq('reply_category', 'Booked')
    .order('replied_at', { ascending: false });

  if (!leads) throw new Error('No leads found');

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  📅 SMART FOLLOW-UP SCHEDULER                                            ║
║  AI-powered timing for maximum response rates                            ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // Prioritize leads
  const prioritized = leads.map(l => {
    const info = getCompanyInfo(l.lead_email);
    const age = getAge(l);
    const tier = info?.tier || 'smb';
    
    let priority = 0;
    if (tier === 'enterprise') priority += 50;
    else if (tier === 'mid-market') priority += 30;
    
    if (l.reply_category === 'Meeting Request') priority += 40;
    else if (l.reply_category === 'Interested') priority += 20;
    
    if (age <= 3) priority += 30;
    else if (age <= 7) priority += 20;
    else if (age <= 14) priority += 10;
    
    const scheduledTime = getNextOptimalTime(l, tier);
    
    return {
      ...l,
      tier,
      age,
      priority,
      company: info?.name || l.lead_company,
      scheduledTime,
      timezone: guessTimezone(l.lead_email)
    };
  });

  // Sort by priority
  prioritized.sort((a, b) => b.priority - a.priority);

  // Group by scheduled day
  const byDay = {};
  prioritized.forEach(l => {
    const day = l.scheduledTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(l);
  });

  // Display schedule
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                    FOLLOW-UP SCHEDULE');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  Object.entries(byDay).slice(0, 5).forEach(([day, dayLeads]) => {
    console.log(`📅 ${day} (${dayLeads.length} leads)`);
    console.log('─'.repeat(70));
    
    dayLeads.slice(0, 5).forEach(l => {
      const time = l.scheduledTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const tierEmoji = l.tier === 'enterprise' ? '🏢' : l.tier === 'mid-market' ? '🏛️' : '🏠';
      console.log(`  ${time}  ${tierEmoji} ${(l.lead_name || 'N/A').padEnd(25)} ${l.company?.slice(0, 20) || 'N/A'}`);
    });
    
    if (dayLeads.length > 5) {
      console.log(`  ... +${dayLeads.length - 5} more`);
    }
    console.log('');
  });

  // Summary
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('                    SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════\n');

  const enterprise = prioritized.filter(l => l.tier === 'enterprise');
  const highPriority = prioritized.filter(l => l.priority >= 60);
  
  console.log(`  📊 Total scheduled: ${prioritized.length} leads`);
  console.log(`  🏢 Enterprise: ${enterprise.length}`);
  console.log(`  ⚡ High priority (60+): ${highPriority.length}`);
  console.log(`\n  💡 Tip: Follow up on high-priority leads first thing each day`);
  
  // Save schedule
  const schedule = prioritized.map(l => ({
    email: l.lead_email,
    name: l.lead_name,
    company: l.company,
    tier: l.tier,
    priority: l.priority,
    scheduledTime: l.scheduledTime.toISOString(),
    category: l.reply_category
  }));

  const fs = require('fs');
  fs.writeFileSync('follow-up-schedule.json', JSON.stringify(schedule, null, 2));
  console.log(`\n  📁 Schedule saved to: follow-up-schedule.json`);
  
  console.log('\n═══════════════════════════════════════════════════════════════════════\n');

  return schedule;
}

module.exports = { generateSchedule, getNextOptimalTime };

if (require.main === module) {
  generateSchedule().catch(console.error);
}
