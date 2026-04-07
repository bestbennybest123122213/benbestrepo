#!/usr/bin/env node
/**
 * Priority Queue - Top leads to follow up today
 * Usage: node priority.js
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function showPriority() {
  const supabase = initSupabase();
  if (!supabase) {
    console.log('❌ Failed to initialize Supabase');
    return;
  }

  const now = new Date();
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🎯 PRIORITY QUEUE - ${now.toLocaleDateString()}
╚══════════════════════════════════════════════════════════════╝
`);

  const { data: leads } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .eq('status', 'Scheduling');

  if (!leads) {
    console.log('❌ No leads found');
    return;
  }
  
  // Notable companies
  const notable = ['rovio', 'sega', 'replit', 'udemy', 'ign', 'osmo', 'doist', 'complex', 'pixonic', 'virtus', 'duolingo'];
  
  // Score leads
  const scored = leads.map(l => {
    const days = l.conversation_date 
      ? Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24))
      : 0;
    
    let score = 0;
    if (days >= 60) score += 40;
    else if (days >= 30) score += 30;
    else if (days >= 14) score += 20;
    
    const company = (l.company || '').toLowerCase();
    if (notable.some(n => company.includes(n))) score += 30;
    
    if (l.category === 'Meeting Request') score += 20;
    else if (l.category === 'Interested') score += 15;
    
    // Check research
    const slug = (l.company || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    const hasResearch = fs.existsSync(path.join(__dirname, 'lead-research', slug + '-research.md'));
    
    return { ...l, days, score, hasResearch };
  }).sort((a, b) => b.score - a.score).slice(0, 10);
  
  scored.forEach((l, i) => {
    const urgency = l.days >= 60 ? '🔴' : l.days >= 30 ? '🟠' : '🟡';
    const research = l.hasResearch ? '📋' : '  ';
    
    console.log(`${urgency} ${String(i+1).padStart(2)}. [${l.score}pts] ${l.name || 'Unknown'} @ ${l.company || 'Unknown'} ${research}`);
    console.log(`      📧 ${l.email}`);
    console.log(`      ⏰ ${l.days} days stale`);
    console.log('');
  });
  
  console.log(`════════════════════════════════════════════════════════════════
📋 = Research file exists

Commands:
  • Generate research: node research-lead.js <email>
  • Generate email:    node quick-email.js <email>
  • View dashboard:    http://localhost:3456 → Stale Leads
════════════════════════════════════════════════════════════════
`);
}

showPriority();
