#!/usr/bin/env node
// Lead Finder - Search for potential leads matching Jan's ICP
// Target: Gaming studios, tech startups, 5M+ downloads, VC-backed, B2C

const fs = require('fs');

// ICP criteria for ItssIMANNN
const ICP = {
  categories: ['gaming', 'mobile games', 'gaming studio', 'game publisher', 'tech startup', 'consumer app', 'edu-tech'],
  signals: ['series A', 'series B', 'series C', 'funded', 'raised', 'million downloads', 'million users', 'DAU', 'MAU'],
  excludeSignals: ['B2B', 'enterprise', 'SaaS', 'developer tools'],
  minEmployees: 10,
  maxEmployees: 1000
};

// Known gaming companies to research
const GAMING_COMPANIES = [
  // Major mobile game publishers
  { name: 'Supercell', domain: 'supercell.com', category: 'Mobile Gaming' },
  { name: 'King', domain: 'king.com', category: 'Mobile Gaming' },
  { name: 'Niantic', domain: 'nianticlabs.com', category: 'AR Gaming' },
  { name: 'Scopely', domain: 'scopely.com', category: 'Mobile Gaming' },
  { name: 'Jam City', domain: 'jamcity.com', category: 'Mobile Gaming' },
  { name: 'Playrix', domain: 'playrix.com', category: 'Mobile Gaming' },
  { name: 'Moon Active', domain: 'moonactive.com', category: 'Mobile Gaming' },
  { name: 'Playtika', domain: 'playtika.com', category: 'Mobile Gaming' },
  { name: 'Netmarble', domain: 'netmarble.com', category: 'Mobile Gaming' },
  { name: 'Com2uS', domain: 'com2us.com', category: 'Mobile Gaming' },
  
  // Rising gaming startups
  { name: 'Metacore', domain: 'metacoregames.com', category: 'Mobile Gaming' },
  { name: 'Dream Games', domain: 'dreamgames.com', category: 'Mobile Gaming' },
  { name: 'Wildlife Studios', domain: 'wildlifestudios.com', category: 'Mobile Gaming' },
  { name: 'Homa Games', domain: 'homagames.com', category: 'Hypercasual' },
  { name: 'Voodoo', domain: 'voodoo.io', category: 'Hypercasual' },
  { name: 'Lion Studios', domain: 'lionstudios.cc', category: 'Hypercasual' },
  
  // PC/Console with mobile presence
  { name: 'Riot Games', domain: 'riotgames.com', category: 'Gaming' },
  { name: 'Epic Games', domain: 'epicgames.com', category: 'Gaming' },
  { name: 'Ubisoft', domain: 'ubisoft.com', category: 'Gaming' },
  { name: '2K Games', domain: '2k.com', category: 'Gaming' },
  { name: 'Bethesda', domain: 'bethesda.net', category: 'Gaming' },
  { name: 'Bungie', domain: 'bungie.net', category: 'Gaming' },
  { name: 'CD Projekt', domain: 'cdprojektred.com', category: 'Gaming' },
  
  // Esports/Gaming adjacent
  { name: 'FaZe Clan', domain: 'fazeclan.com', category: 'Esports' },
  { name: '100 Thieves', domain: '100thieves.com', category: 'Esports' },
  { name: 'TSM', domain: 'tsm.gg', category: 'Esports' },
  { name: 'Cloud9', domain: 'cloud9.gg', category: 'Esports' },
  { name: 'Team Liquid', domain: 'teamliquid.com', category: 'Esports' },
];

// Recently funded companies (2024-2025)
const RECENTLY_FUNDED = [
  { name: 'Spyke Games', funding: '$55M Series B', domain: 'spykegames.com', category: 'Mobile Gaming' },
  { name: 'Paradox Interactive', funding: 'Public', domain: 'paradoxinteractive.com', category: 'Strategy Games' },
  { name: 'Phoenix Labs', funding: '$150M', domain: 'phoenixlabs.ca', category: 'Gaming' },
  { name: 'Lightfox Games', funding: '$50M', domain: 'lightfoxgames.com', category: 'Mobile Gaming' },
  { name: 'Gamefam', funding: '$25M', domain: 'gamefam.com', category: 'Roblox Games' },
  { name: 'Rec Room', funding: '$145M Series D', domain: 'recroom.com', category: 'Social Gaming' },
  { name: 'Manticore Games', funding: '$100M', domain: 'manticoregames.com', category: 'UGC Platform' },
];

// Consumer apps with influencer potential
const CONSUMER_APPS = [
  { name: 'Duolingo', domain: 'duolingo.com', category: 'Education' },
  { name: 'Calm', domain: 'calm.com', category: 'Wellness' },
  { name: 'Headspace', domain: 'headspace.com', category: 'Wellness' },
  { name: 'Notion', domain: 'notion.so', category: 'Productivity' },
  { name: 'Canva', domain: 'canva.com', category: 'Design' },
  { name: 'Grammarly', domain: 'grammarly.com', category: 'Writing' },
  { name: 'Audible', domain: 'audible.com', category: 'Audio' },
  { name: 'Spotify', domain: 'spotify.com', category: 'Music' },
  { name: 'Discord', domain: 'discord.com', category: 'Social' },
  { name: 'Twitch', domain: 'twitch.tv', category: 'Streaming' },
];

function generateProspectList() {
  const allProspects = [
    ...GAMING_COMPANIES.map(c => ({ ...c, type: 'Gaming' })),
    ...RECENTLY_FUNDED.map(c => ({ ...c, type: 'Recently Funded' })),
    ...CONSUMER_APPS.map(c => ({ ...c, type: 'Consumer App' })),
  ];
  
  console.log('🎯 LEAD FINDER - Prospect List for ItssIMANNN\n');
  console.log('Target: Gaming studios, tech startups, B2C apps');
  console.log('═'.repeat(60) + '\n');
  
  // Group by type
  const byType = {};
  allProspects.forEach(p => {
    if (!byType[p.type]) byType[p.type] = [];
    byType[p.type].push(p);
  });
  
  Object.entries(byType).forEach(([type, prospects]) => {
    console.log(`\n📁 ${type.toUpperCase()} (${prospects.length} companies)\n`);
    console.log('Name'.padEnd(25) + 'Domain'.padEnd(30) + 'Category');
    console.log('-'.repeat(70));
    prospects.forEach(p => {
      console.log(p.name.padEnd(25) + p.domain.padEnd(30) + (p.category || '-'));
    });
  });
  
  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Total prospects: ${allProspects.length}`);
  console.log('   Gaming: ' + GAMING_COMPANIES.length);
  console.log('   Recently Funded: ' + RECENTLY_FUNDED.length);
  console.log('   Consumer Apps: ' + CONSUMER_APPS.length);
  
  // Save to JSON for further processing
  fs.writeFileSync('prospect-list.json', JSON.stringify({
    generated: new Date().toISOString(),
    icp: ICP,
    prospects: allProspects
  }, null, 2));
  
  console.log('\n✅ Saved to prospect-list.json');
}

generateProspectList();
