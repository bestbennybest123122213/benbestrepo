#!/usr/bin/env node
/**
 * System Health Check
 * Verifies all GEX components are working correctly
 */

const fs = require('fs');
const path = require('path');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  🔧 SYSTEM HEALTH CHECK                                        ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const checks = [];

// Check 1: Data files exist
console.log('📁 DATA FILES');
console.log('─'.repeat(60));

const dataFiles = [
  { name: 'enriched-leads.json', required: true },
  { name: 'priority-drafts.json', required: false },
  { name: 'followup-schedule-today.json', required: false },
  { name: 'competitive-intel.json', required: false },
  { name: 'weekly-history.json', required: false },
  { name: 'daily-report.json', required: false }
];

dataFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file.name));
  const status = exists ? '✅' : (file.required ? '❌' : '⚠️');
  const message = exists ? 'Found' : (file.required ? 'MISSING (required)' : 'Not generated yet');
  console.log(`  ${status} ${file.name.padEnd(30)} ${message}`);
  checks.push({ name: file.name, status: exists, required: file.required });
});

// Check 2: Lead data quality
console.log('\n📊 DATA QUALITY');
console.log('─'.repeat(60));

try {
  const { leads } = require('./enriched-leads.json');
  console.log(`  ✅ Leads loaded:              ${leads.length}`);
  
  const withEmail = leads.filter(l => l.lead_email).length;
  console.log(`  ${withEmail === leads.length ? '✅' : '⚠️'} Leads with email:          ${withEmail}/${leads.length}`);
  
  const withCategory = leads.filter(l => l.reply_category).length;
  console.log(`  ${withCategory === leads.length ? '✅' : '⚠️'} Leads with category:        ${withCategory}/${leads.length}`);
  
  const withTier = leads.filter(l => l.tier && l.tier !== 'unknown').length;
  console.log(`  ${withTier > leads.length * 0.3 ? '✅' : '⚠️'} Leads with known tier:      ${withTier}/${leads.length} (${(withTier/leads.length*100).toFixed(0)}%)`);
  
  checks.push({ name: 'Data quality', status: withEmail === leads.length, required: true });
} catch (e) {
  console.log(`  ❌ Failed to load leads: ${e.message}`);
  checks.push({ name: 'Data quality', status: false, required: true });
}

// Check 3: GEX commands
console.log('\n🤖 GEX COMMANDS');
console.log('─'.repeat(60));

try {
  const gexContent = fs.readFileSync(path.join(__dirname, 'gex.js'), 'utf8');
  const commandCount = (gexContent.match(/^\s+\w+:/gm) || []).length;
  console.log(`  ✅ Total commands:            ${commandCount}`);
  checks.push({ name: 'GEX commands', status: commandCount > 50, required: true });
} catch (e) {
  console.log(`  ❌ Failed to read gex.js: ${e.message}`);
}

// Check 4: Environment
console.log('\n⚙️  ENVIRONMENT');
console.log('─'.repeat(60));

const envExists = fs.existsSync(path.join(__dirname, '.env'));
console.log(`  ${envExists ? '✅' : '❌'} .env file:                 ${envExists ? 'Found' : 'MISSING'}`);
checks.push({ name: '.env file', status: envExists, required: true });

if (envExists) {
  const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const hasSmartlead = envContent.includes('SMARTLEAD');
  const hasSupabase = envContent.includes('SUPABASE');
  console.log(`  ${hasSmartlead ? '✅' : '⚠️'} SMARTLEAD_API_KEY:         ${hasSmartlead ? 'Configured' : 'Not found'}`);
  console.log(`  ${hasSupabase ? '✅' : '⚠️'} SUPABASE credentials:      ${hasSupabase ? 'Configured' : 'Not found'}`);
}

// Check 5: Recent activity
console.log('\n📅 RECENT ACTIVITY');
console.log('─'.repeat(60));

const recentFiles = ['daily-report.json', 'alert-state.json', '.last-reply-check.json'];
recentFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const ageHours = ((Date.now() - stats.mtime) / (1000 * 60 * 60)).toFixed(1);
    const status = parseFloat(ageHours) < 24 ? '✅' : '⚠️';
    console.log(`  ${status} ${file.padEnd(25)} Last updated: ${ageHours}h ago`);
  } else {
    console.log(`  ⚪ ${file.padEnd(25)} Not generated yet`);
  }
});

// Summary
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('📋 SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');

const failed = checks.filter(c => !c.status && c.required);
const warnings = checks.filter(c => !c.status && !c.required);

if (failed.length === 0) {
  console.log('\n  ✅ All systems operational!');
} else {
  console.log(`\n  ❌ ${failed.length} critical issues:`);
  failed.forEach(f => console.log(`     - ${f.name}`));
}

if (warnings.length > 0) {
  console.log(`\n  ⚠️  ${warnings.length} warnings:`);
  warnings.forEach(w => console.log(`     - ${w.name} (optional)`));
}

// Quick actions
console.log('\n💡 QUICK ACTIONS');
console.log('─'.repeat(60));
console.log('  node gex.js action       # See what to do now');
console.log('  node gex.js dreport      # Generate daily report');
console.log('  node gex.js pdrafts      # Generate email drafts');
console.log('  node gex.js overnight    # Full overnight summary');

console.log('\n');
