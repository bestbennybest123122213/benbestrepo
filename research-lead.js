#!/usr/bin/env node
/**
 * Lead Research Generator
 * Usage: node research-lead.js <email>
 * 
 * Note: This script generates a research template.
 * For full web search research, use the dashboard or Claude.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function researchLead(email) {
  // Get lead data
  const { data: lead, error } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .eq('email', email)
    .single();
  
  if (error || !lead) {
    console.log('Lead not found:', email);
    return;
  }
  
  const now = new Date();
  const daysStale = lead.conversation_date 
    ? Math.floor((now - new Date(lead.conversation_date)) / (1000 * 60 * 60 * 24))
    : 0;
  
  const company = lead.company || 'Unknown';
  const name = lead.name || 'Unknown';
  const domain = email.split('@')[1];
  
  // Generate research template
  const template = `# ${company} - Lead Research

**Contact:** ${name} (${email})
**Status:** ${daysStale} days stale - ${daysStale >= 60 ? 'CRITICAL' : daysStale >= 30 ? 'WARM' : 'RECENT'}
**Last researched:** ${now.toISOString().split('T')[0]}

## Company Overview
- **Website:** https://${domain}
- **Type:** [TO RESEARCH]
- **Size:** [TO RESEARCH]

## Recent News
[Search for: "${company} 2025 2026 news marketing"]

1. [Finding 1]
2. [Finding 2]
3. [Finding 3]

## Key People
- **${name}** - Our contact

## Outreach Angle

**Subject:** "[Personalized subject based on news]"

**Email:**
\`\`\`
Hey ${name.split(' ')[0]},

[Personalized opening based on company news]

We connected back in ${lead.conversation_month || 'recently'} about influencer marketing for ${company}.

ItssIMANNN (10M+ subs) has driven 100K+ users for similar clients with 3% CTR and 30% conversion rates.

Worth a quick chat?

Best,
Imann
\`\`\`

## Why They're a Good Fit
1. [Reason based on research]
2. [Audience overlap]
3. [Budget indicators]

## Research To-Do
- [ ] Search company website for news
- [ ] Check LinkedIn for ${name}
- [ ] Look for recent funding/announcements
- [ ] Identify decision makers

---
*Template generated. Add web research to complete.*
`;

  // Ensure directory exists
  const researchDir = path.join(__dirname, 'lead-research');
  if (!fs.existsSync(researchDir)) {
    fs.mkdirSync(researchDir, { recursive: true });
  }
  
  // Save file
  const filename = company.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-research.md';
  const filepath = path.join(researchDir, filename);
  
  fs.writeFileSync(filepath, template);
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  📋 RESEARCH TEMPLATE GENERATED                               ║
╚══════════════════════════════════════════════════════════════╝

Lead: ${name} @ ${company}
Email: ${email}
Status: ${daysStale} days stale

File saved: ${filepath}

Next steps:
1. Search: "${company} 2025 2026 news marketing funding"
2. Check: https://${domain}
3. LinkedIn: ${name}
4. Update the research file with findings

Existing research files:
`);

  // List existing research files
  const files = fs.readdirSync(researchDir);
  files.forEach(f => console.log(`  • ${f}`));
}

// CLI
const email = process.argv[2];
if (!email) {
  console.log('Usage: node research-lead.js <email>');
  console.log('Example: node research-lead.js olli.laamanen@rovio.com');
  process.exit(1);
}

researchLead(email);
