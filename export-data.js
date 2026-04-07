#!/usr/bin/env node
/**
 * Data Export Tool
 * 
 * Export leads to various formats:
 * - CSV
 * - JSON
 * - Markdown table
 * 
 * Usage:
 *   node export-data.js csv                     # Export all to CSV
 *   node export-data.js csv --filter=hot        # Export hot leads
 *   node export-data.js json --filter=enterprise
 *   node export-data.js md --filter=meetings
 */

require('dotenv').config();
const fs = require('fs');
const { initSupabase } = require('./lib/supabase');
const { getCompanyInfo } = require('./lead-enrichment');

const EXPORT_DIR = './exports';

// Ensure export directory exists
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

async function getLeads(filter) {
  const client = initSupabase();
  if (!client) return [];

  const { data: leads } = await client
    .from('positive_replies')
    .select('*')
    .order('replied_at', { ascending: false });

  if (!leads) return [];

  const now = Date.now();
  const getAge = (l) => l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 999;

  // Apply filter
  switch (filter) {
    case 'hot':
      return leads.filter(l => getAge(l) <= 3 && l.reply_category !== 'Booked');
    case 'stale':
      return leads.filter(l => getAge(l) > 14 && l.reply_category !== 'Booked');
    case 'enterprise':
      return leads.filter(l => {
        const info = getCompanyInfo(l.lead_email);
        return info?.tier === 'enterprise' && l.reply_category !== 'Booked';
      });
    case 'meetings':
      return leads.filter(l => l.reply_category === 'Meeting Request');
    case 'booked':
      return leads.filter(l => l.reply_category === 'Booked');
    case 'interested':
      return leads.filter(l => l.reply_category === 'Interested');
    default:
      return leads;
  }
}

function toCSV(leads) {
  const headers = ['Name', 'Email', 'Company', 'Category', 'Replied At', 'Age (days)', 'Status'];
  const now = Date.now();
  
  const rows = leads.map(l => {
    const age = l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A';
    const info = getCompanyInfo(l.lead_email);
    return [
      l.lead_name || '',
      l.lead_email || '',
      info?.name || l.lead_company || '',
      l.reply_category || '',
      l.replied_at ? new Date(l.replied_at).toISOString().slice(0, 10) : '',
      age,
      l.follow_up_status || 'pending'
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function toMarkdown(leads) {
  const now = Date.now();
  const headers = '| Name | Company | Category | Age | Status |';
  const separator = '|------|---------|----------|-----|--------|';
  
  const rows = leads.map(l => {
    const age = l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A';
    const info = getCompanyInfo(l.lead_email);
    return `| ${l.lead_name || 'N/A'} | ${info?.name || 'N/A'} | ${l.reply_category} | ${age}d | ${l.follow_up_status || 'pending'} |`;
  });

  return [headers, separator, ...rows].join('\n');
}

function toJSON(leads) {
  const now = Date.now();
  return JSON.stringify(leads.map(l => {
    const info = getCompanyInfo(l.lead_email);
    return {
      name: l.lead_name,
      email: l.lead_email,
      company: info?.name || l.lead_company,
      category: l.reply_category,
      replied_at: l.replied_at,
      age_days: l.replied_at ? Math.floor((now - new Date(l.replied_at).getTime()) / (1000 * 60 * 60 * 24)) : null,
      status: l.follow_up_status || 'pending',
      tier: info?.tier
    };
  }), null, 2);
}

async function main() {
  const args = process.argv.slice(2);
  const format = args[0] || 'csv';
  const filterArg = args.find(a => a.startsWith('--filter='));
  const filter = filterArg ? filterArg.split('=')[1] : 'all';

  console.log(`\n📤 Exporting leads (filter: ${filter}, format: ${format})\n`);

  const leads = await getLeads(filter);
  
  if (leads.length === 0) {
    console.log('No leads found with this filter');
    return;
  }

  const timestamp = new Date().toISOString().slice(0, 10);
  let content, ext;

  switch (format) {
    case 'csv':
      content = toCSV(leads);
      ext = 'csv';
      break;
    case 'json':
      content = toJSON(leads);
      ext = 'json';
      break;
    case 'md':
    case 'markdown':
      content = toMarkdown(leads);
      ext = 'md';
      break;
    default:
      console.log('Unknown format. Use: csv, json, md');
      return;
  }

  const filename = `leads-${filter}-${timestamp}.${ext}`;
  const filepath = `${EXPORT_DIR}/${filename}`;
  
  fs.writeFileSync(filepath, content);
  
  console.log(`✅ Exported ${leads.length} leads to ${filepath}`);
  console.log(`   File size: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);
}

module.exports = { getLeads, toCSV, toJSON, toMarkdown };

if (require.main === module) {
  main().catch(console.error);
}
