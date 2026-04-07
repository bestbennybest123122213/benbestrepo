const fs = require('fs');

// Load leads
const data = JSON.parse(fs.readFileSync('ranked-leads.json', 'utf8'));
const leads = data.leads;
const positive = leads.filter(l => ['Interested', 'Meeting Request', 'Meeting Booked'].includes(l.reply_category));

// Complete company classification based on business models
const COMPANY_FIT = {
  // PERFECT FIT - Gaming, FinTech, Consumer Apps with auth needs
  'stillfront': { fit: 'PERFECT', reason: 'Mobile gaming publisher - mass consumer auth' },
  'paradox': { fit: 'PERFECT', reason: 'Gaming studio with online multiplayer' },
  'unity': { fit: 'PERFECT', reason: 'Gaming platform - developer tools for auth' },
  'carry1st': { fit: 'PERFECT', reason: 'African gaming publisher - mobile auth' },
  'poki': { fit: 'PERFECT', reason: 'Browser gaming platform - user accounts' },
  'crunchyroll': { fit: 'PERFECT', reason: 'Anime streaming - millions of subscribers' },
  'kinguin': { fit: 'PERFECT', reason: 'Gaming marketplace - buyer/seller auth' },
  'rainbet': { fit: 'PERFECT', reason: 'Crypto casino - KYC/verification critical' },
  'candivore': { fit: 'PERFECT', reason: 'Mobile gaming studio' },
  'owlcat': { fit: 'PERFECT', reason: 'Gaming studio - Pathfinder games' },
  'coatsink': { fit: 'PERFECT', reason: 'VR gaming studio' },
  'outfit7': { fit: 'PERFECT', reason: 'Talking Tom - billions of downloads' },
  'eneba': { fit: 'PERFECT', reason: 'Gaming marketplace - user verification' },
  'solsten': { fit: 'PERFECT', reason: 'Gaming analytics - player insights' },
  'ign': { fit: 'PERFECT', reason: 'Gaming media - large user base' },
  'wahed': { fit: 'PERFECT', reason: 'Islamic fintech - investment app auth' },
  'gyandhan': { fit: 'PERFECT', reason: 'Student loans fintech - KYC required' },
  'virtus': { fit: 'PERFECT', reason: 'Esports org - fan engagement app' },
  'jackpot': { fit: 'PERFECT', reason: 'Social casino app - age verification' },
  'colossalorder': { fit: 'PERFECT', reason: 'Cities Skylines dev - gaming studio' },
  'puntaa': { fit: 'PERFECT', reason: 'Sports betting/social - user verification' },
  'weedmaps': { fit: 'PERFECT', reason: 'Cannabis marketplace - age verification critical' },
  'payzli': { fit: 'PERFECT', reason: 'Payment processing - transaction auth' },
  'naturalcycles': { fit: 'PERFECT', reason: 'Fertility app - healthcare + consumer' },
  
  // GOOD FIT - Consumer SaaS, marketplaces
  'replit': { fit: 'GOOD', reason: 'Developer platform - user accounts' },
  'udemy': { fit: 'GOOD', reason: 'EdTech platform - student auth' },
  'naver': { fit: 'GOOD', reason: 'Korean tech giant - various services' },
  'preply': { fit: 'GOOD', reason: 'Language tutoring marketplace' },
  'omio': { fit: 'GOOD', reason: 'Travel booking - consumer app' },
  'beehiiv': { fit: 'GOOD', reason: 'Newsletter platform - creator auth' },
  'doist': { fit: 'GOOD', reason: 'Productivity apps (Todoist) - user accounts' },
  'spothero': { fit: 'GOOD', reason: 'Parking app - consumer bookings' },
  'air up': { fit: 'GOOD', reason: 'D2C beverage - e-commerce auth' },
  'goodeggs': { fit: 'GOOD', reason: 'Grocery delivery - consumer app' },
  'complex': { fit: 'GOOD', reason: 'Media/culture site - user engagement' },
  'imagen': { fit: 'GOOD', reason: 'Photo AI for photographers - SaaS auth' },
  'easeus': { fit: 'GOOD', reason: 'Software company - license/account mgmt' },
  'threedy': { fit: 'GOOD', reason: '3D tech - enterprise but has consumer tools' },
  'daydream': { fit: 'GOOD', reason: 'AR/VR experiences - consumer auth' },
  'trustedhousesitters': { fit: 'GOOD', reason: 'Peer marketplace - trust/verification' },
  'mindtrip': { fit: 'GOOD', reason: 'AI travel planner - consumer app' },
  'typology': { fit: 'GOOD', reason: 'D2C skincare - e-commerce' },
  'gozney': { fit: 'GOOD', reason: 'D2C pizza ovens - e-commerce' },
  'joeandsephs': { fit: 'GOOD', reason: 'D2C gourmet food - e-commerce' },
  'qult': { fit: 'GOOD', reason: 'AI platform - user accounts' },
  'studystream': { fit: 'GOOD', reason: 'Study community app' },
  'pulsetto': { fit: 'GOOD', reason: 'Wellness device + app' },
  'tokenwell': { fit: 'GOOD', reason: 'Crypto/tokens - verification needed' },
  'go-electra': { fit: 'GOOD', reason: 'EV charging - consumer app' },
  'rideyego': { fit: 'GOOD', reason: 'Mobility/scooter service' },
  'drink-trip': { fit: 'GOOD', reason: 'Beverage discovery app' },
  'livekindred': { fit: 'GOOD', reason: 'Community/social platform' },
  'antec': { fit: 'GOOD', reason: 'PC hardware - e-commerce potential' },
  'thermal': { fit: 'GOOD', reason: 'Travel tech - consumer bookings' },
  
  // NOT FIT - B2B only, industrial, non-consumer
  'coppernico': { fit: 'NOT_FIT', reason: 'Mining company - industrial B2B' },
  'urunn': { fit: 'NOT_FIT', reason: 'Unknown/B2B' },
  'sombrero': { fit: 'NOT_FIT', reason: 'Unknown/likely B2B' },
  'umiasalud': { fit: 'NOT_FIT', reason: 'Healthcare clinic - not SaaS' },
  'thermalradar': { fit: 'NOT_FIT', reason: 'B2B industrial sensors' },
  'circlesecurity': { fit: 'NOT_FIT', reason: 'B2B security - not consumer auth' },
  'labradorcms': { fit: 'NOT_FIT', reason: 'B2B CMS - enterprise software' },
  'personainc': { fit: 'NOT_FIT', reason: 'B2B AI - enterprise focus' },
  'evergreenlodge': { fit: 'NOT_FIT', reason: 'Single hotel - not SaaS' },
  'destinationcle': { fit: 'NOT_FIT', reason: 'Tourism org - not tech' },
  'playingforchange': { fit: 'NOT_FIT', reason: 'Music nonprofit - not SaaS' },
  'assemblyfestival': { fit: 'NOT_FIT', reason: 'Festival - event, not platform' },
  'santamonica': { fit: 'NOT_FIT', reason: 'City govt - not commercial' },
  'juicymarbles': { fit: 'NOT_FIT', reason: 'Food product company - D2C but tiny' },
  'doublegood': { fit: 'NOT_FIT', reason: 'Fundraising popcorn - niche' },
  'doingthings': { fit: 'NOT_FIT', reason: 'Meme media company - no auth needs' },
  'trymartin': { fit: 'NOT_FIT', reason: 'Unknown small company' }
};

function analyzeFit(lead) {
  const company = (lead.lead_company || '').toLowerCase();
  const domain = (lead.lead_email || '').split('@')[1]?.replace('.com', '').replace('.io', '').replace('.tech', '') || '';
  
  // Check all known companies
  for (const [key, value] of Object.entries(COMPANY_FIT)) {
    if (company.includes(key) || domain.includes(key)) {
      return value;
    }
  }
  
  // Default fallback
  return { fit: 'REVIEW', reason: 'Manual review needed' };
}

// Analyze all leads
const results = positive.map(lead => {
  const analysis = analyzeFit(lead);
  return {
    name: lead.lead_name,
    company: lead.lead_company,
    email: lead.lead_email,
    status: lead.reply_category,
    industry: lead.companyInfo?.industry || 'Unknown',
    tier: lead.companyInfo?.tier || 'unknown',
    fit: analysis.fit,
    reason: analysis.reason,
    score: lead.score,
    replied_at: lead.replied_at
  };
});

// Sort: PERFECT > GOOD > REVIEW > NOT_FIT, then by score
const fitOrder = { 'PERFECT': 1, 'GOOD': 2, 'REVIEW': 3, 'NOT_FIT': 4 };
results.sort((a, b) => fitOrder[a.fit] - fitOrder[b.fit] || b.score - a.score);

// Generate CSV
const headers = ['Name', 'Company', 'Email', 'Status', 'Industry', 'Tier', 'GAuth_Fit', 'Reason', 'Score', 'Reply_Date'];
let csv = headers.join(',') + '\n';
results.forEach(r => {
  const row = [
    `"${r.name}"`,
    `"${r.company}"`,
    r.email,
    r.status,
    `"${r.industry}"`,
    r.tier,
    r.fit,
    `"${r.reason}"`,
    r.score,
    r.replied_at?.split('T')[0] || ''
  ];
  csv += row.join(',') + '\n';
});

fs.writeFileSync('gauth-fit-analysis-complete.csv', csv);

// Summary
console.log('=== GAUTH FIT ANALYSIS COMPLETE ===\n');
console.log('Summary:');
const perfect = results.filter(r => r.fit === 'PERFECT');
const good = results.filter(r => r.fit === 'GOOD');
const review = results.filter(r => r.fit === 'REVIEW');
const notFit = results.filter(r => r.fit === 'NOT_FIT');

console.log(`✅ PERFECT FIT: ${perfect.length}`);
console.log(`👍 GOOD FIT: ${good.length}`);
console.log(`🔍 NEEDS REVIEW: ${review.length}`);
console.log(`❌ NOT FIT: ${notFit.length}`);
console.log(`\nTotal: ${results.length}`);

console.log('\n=== PERFECT FITS (Priority follow-up) ===');
perfect.forEach((r, i) => {
  console.log(`${i+1}. ${r.name} @ ${r.company} - ${r.reason}`);
});

console.log('\n=== GOOD FITS ===');
good.forEach((r, i) => {
  console.log(`${i+1}. ${r.name} @ ${r.company} - ${r.reason}`);
});

console.log('\n=== NOT FIT (Deprioritize) ===');
notFit.forEach((r, i) => {
  console.log(`${i+1}. ${r.name} @ ${r.company} - ${r.reason}`);
});

if (review.length > 0) {
  console.log('\n=== NEEDS REVIEW ===');
  review.forEach((r, i) => {
    console.log(`${i+1}. ${r.name} @ ${r.company}`);
  });
}

console.log('\n📁 Saved to: gauth-fit-analysis-complete.csv');
