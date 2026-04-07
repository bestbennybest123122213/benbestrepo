/**
 * Today Command - The ONE thing to do today
 * Works OFFLINE - no Supabase required
 * Uses cached local data
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const DATA_FILE = path.join(__dirname, '..', 'data', 'positive-replies-processed.json');
const DRAFTS_DIR = path.join(__dirname, '..', '..', 'drafts');

function loadCachedLeads() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return data.leads || [];
  } catch (e) {
    return [];
  }
}

function getSchedulingLeads(leads) {
  // Find leads that are in scheduling status (not booked, not lost)
  return leads.filter(l => 
    l.status && 
    l.status.toLowerCase() !== 'booked' && 
    l.status.toLowerCase() !== 'lost' &&
    l.status.toLowerCase() !== 'closed' &&
    l.category && 
    (l.category.includes('Meeting') || l.category.includes('Interested') || l.category.includes('Information'))
  );
}

function calculateAge(dateStr) {
  if (!dateStr) return 999;
  try {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return 999;
    const date = new Date(parts[2], parts[0] - 1, parts[1]);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  } catch (e) {
    return 999;
  }
}

function generateEmail(lead) {
  return `Subject: Re: [original thread]

Hey ${lead.name.split(' ')[0]},

Just following up on this. Still interested in exploring a campaign with ItssIMANNN?

Happy to jump on a quick call whenever works for you.

Best,
Jan`;
}

async function run(args = []) {
  console.log(chalk.cyan.bold('\n🎯 TODAY - The ONE Thing\n'));
  console.log(chalk.gray('(Works offline - using cached data)\n'));
  
  const leads = loadCachedLeads();
  
  if (leads.length === 0) {
    console.log(chalk.yellow('No cached lead data found.'));
    console.log(chalk.gray('Run a sync when Supabase is back online.\n'));
    return;
  }
  
  // Get scheduling leads and sort by freshness
  const scheduling = getSchedulingLeads(leads);
  
  if (scheduling.length === 0) {
    console.log(chalk.yellow('No leads in scheduling status.'));
    console.log(chalk.gray('All leads are either booked or closed.\n'));
    return;
  }
  
  // Sort by age (freshest first)
  scheduling.sort((a, b) => {
    const ageA = calculateAge(a.conv_date || a.lead_response);
    const ageB = calculateAge(b.conv_date || b.lead_response);
    return ageA - ageB;
  });
  
  // Get the freshest lead
  const topLead = scheduling[0];
  const age = calculateAge(topLead.conv_date || topLead.lead_response);
  
  console.log(chalk.white.bold('━'.repeat(50)));
  console.log(chalk.green.bold('\n✅ YOUR ONE ACTION TODAY:\n'));
  console.log(chalk.white(`   Reply to ${chalk.bold(topLead.name)} @ ${chalk.bold(topLead.company)}`));
  console.log(chalk.gray(`   ${topLead.email}`));
  console.log(chalk.gray(`   Category: ${topLead.category} | Age: ${age} days\n`));
  console.log(chalk.white.bold('━'.repeat(50)));
  
  console.log(chalk.cyan('\n📧 COPY-PASTE EMAIL:\n'));
  console.log(chalk.white(generateEmail(topLead)));
  console.log(chalk.white.bold('\n━'.repeat(50)));
  
  // Show 2 more options
  if (scheduling.length > 1) {
    console.log(chalk.gray('\n📋 Also worth considering:'));
    for (let i = 1; i < Math.min(3, scheduling.length); i++) {
      const lead = scheduling[i];
      const leadAge = calculateAge(lead.conv_date || lead.lead_response);
      console.log(chalk.gray(`   ${i+1}. ${lead.name} @ ${lead.company} (${leadAge}d)`));
    }
  }
  
  console.log(chalk.gray(`\n📊 Pipeline: ${scheduling.length} leads in scheduling\n`));
}

module.exports = { run };
