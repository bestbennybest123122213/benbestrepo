#!/usr/bin/env node
/**
 * Company Research Helper
 * 
 * Generates research briefs for companies:
 * - Basic company info
 * - Funding data
 * - Key people
 * - Talking points
 */

require('dotenv').config();
const { getCompanyInfo } = require('./lead-enrichment');
const { initSupabase } = require('./lib/supabase');

// Extended company data
const COMPANY_RESEARCH = {
  'unity.com': {
    name: 'Unity Technologies',
    founded: 2004,
    hq: 'San Francisco, CA',
    employees: '5,000+',
    funding: 'Public (NYSE: U)',
    revenue: '$1.4B (2023)',
    industry: 'Game Development, 3D Graphics',
    products: ['Unity Engine', 'Unity Ads', 'Unity Gaming Services'],
    competitors: ['Unreal Engine', 'Godot', 'GameMaker'],
    recentNews: 'Major restructuring in 2024, focus on profitable growth',
    talkingPoints: [
      'Large creator ecosystem - 3.9M+ monthly active creators',
      'Strong mobile game market presence',
      'Moving into automotive, film, architecture verticals',
      'Creator monetization is key priority'
    ]
  },
  'udemy.com': {
    name: 'Udemy',
    founded: 2010,
    hq: 'San Francisco, CA',
    employees: '1,000+',
    funding: '$310M raised, Public (NASDAQ: UDMY)',
    industry: 'EdTech, Online Learning',
    products: ['Udemy Consumer', 'Udemy Business'],
    competitors: ['Coursera', 'LinkedIn Learning', 'Skillshare'],
    talkingPoints: [
      '57M+ learners worldwide',
      'B2B segment (Udemy Business) growing fast',
      'Focus on enterprise upskilling',
      'Content creator partnerships key to growth'
    ]
  },
  'replit.com': {
    name: 'Replit',
    founded: 2016,
    hq: 'San Francisco, CA',
    employees: '100+',
    funding: '$400M+ raised (Andreessen Horowitz led)',
    industry: 'Developer Tools, IDE',
    products: ['Replit IDE', 'Replit AI', 'Replit Deployments'],
    competitors: ['GitHub Codespaces', 'CodeSandbox', 'Gitpod'],
    talkingPoints: [
      '20M+ developers on platform',
      'AI-first development environment',
      'Strong in education market',
      'Fastest-growing cloud IDE'
    ]
  },
  'dream11.com': {
    name: 'Dream11',
    founded: 2008,
    hq: 'Mumbai, India',
    employees: '1,000+',
    funding: '$1.5B+ raised (Decacorn)',
    industry: 'Fantasy Sports, Gaming',
    products: ['Dream11 Fantasy Cricket', 'Fantasy Football'],
    competitors: ['MPL', 'MyTeam11', 'My11Circle'],
    talkingPoints: [
      '150M+ users in India',
      'Official partner of IPL, NBA, NFL',
      'Largest fantasy sports platform in India',
      'Expanding into new sports categories'
    ]
  },
  'paradoxinteractive.com': {
    name: 'Paradox Interactive',
    founded: 1999,
    hq: 'Stockholm, Sweden',
    employees: '600+',
    funding: 'Public (STO: PDX)',
    industry: 'Video Games, Strategy Games',
    products: ['Crusader Kings', 'Europa Universalis', 'Stellaris', 'Cities: Skylines'],
    competitors: ['Creative Assembly', 'Firaxis', 'Amplitude'],
    talkingPoints: [
      'King of grand strategy games',
      'Strong DLC/expansion model',
      'Dedicated fanbase with long game lifespans',
      'Publishing arm for indie developers'
    ]
  }
};

function getDomainFromEmail(email) {
  return email.split('@')[1];
}

async function researchCompany(emailOrDomain) {
  const domain = emailOrDomain.includes('@') ? getDomainFromEmail(emailOrDomain) : emailOrDomain;
  const baseDomain = domain.split('.').slice(-2).join('.');
  
  // Check our database
  const info = getCompanyInfo(emailOrDomain.includes('@') ? emailOrDomain : `test@${domain}`);
  
  // Check extended research
  const research = COMPANY_RESEARCH[baseDomain] || COMPANY_RESEARCH[domain];

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🔍 COMPANY RESEARCH: ${(info?.name || domain).toUpperCase().slice(0, 40).padEnd(40)}      ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  if (!info && !research) {
    console.log('  ⚠️  Limited data available for this company\n');
    console.log(`  Domain: ${domain}`);
    console.log(`\n  💡 Try searching: https://www.crunchbase.com/organization/${baseDomain.split('.')[0]}`);
    console.log(`  💡 Or LinkedIn: https://www.linkedin.com/company/${baseDomain.split('.')[0]}`);
    return;
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 BASIC INFO');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`  Company:     ${research?.name || info?.name || 'N/A'}`);
  console.log(`  Domain:      ${domain}`);
  console.log(`  Founded:     ${research?.founded || 'N/A'}`);
  console.log(`  HQ:          ${research?.hq || 'N/A'}`);
  console.log(`  Employees:   ${research?.employees || 'N/A'}`);
  console.log(`  Industry:    ${research?.industry || info?.industry || 'N/A'}`);
  console.log(`  Tier:        ${info?.tier || 'Unknown'}`);

  if (research?.funding || info?.funding) {
    console.log(`\n  💰 Funding:   ${research?.funding || info?.funding}`);
    if (research?.revenue) {
      console.log(`  💵 Revenue:   ${research?.revenue}`);
    }
  }

  if (research?.products) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏷️ PRODUCTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    research.products.forEach(p => console.log(`  • ${p}`));
  }

  if (research?.competitors) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚔️ COMPETITORS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    research.competitors.forEach(c => console.log(`  • ${c}`));
  }

  if (research?.talkingPoints) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💬 TALKING POINTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    research.talkingPoints.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  }

  if (research?.recentNews) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📰 RECENT NEWS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`  ${research.recentNews}`);
  }

  // Get leads from this company
  const client = initSupabase();
  if (client) {
    const { data: leads } = await client
      .from('positive_replies')
      .select('*')
      .ilike('lead_email', `%${baseDomain}%`);

    if (leads && leads.length > 0) {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`👥 YOUR CONTACTS (${leads.length})`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      leads.forEach(l => {
        console.log(`  • ${l.lead_name || 'N/A'} (${l.reply_category})`);
        console.log(`    ${l.lead_email}`);
      });
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
}

async function main() {
  const query = process.argv[2];
  
  if (!query) {
    console.log('Usage: node company-research.js <email or domain>');
    console.log('Example: node company-research.js nick@unity.com');
    console.log('Example: node company-research.js udemy.com');
    return;
  }

  await researchCompany(query);
}

module.exports = { researchCompany, COMPANY_RESEARCH };

if (require.main === module) {
  main().catch(console.error);
}
