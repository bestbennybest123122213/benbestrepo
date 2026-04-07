const fs = require('fs');

// Load leads
const data = JSON.parse(fs.readFileSync('ranked-leads.json', 'utf8'));
const leads = data.leads;
const positive = leads.filter(l => ['Interested', 'Meeting Request', 'Meeting Booked'].includes(l.reply_category));

// GAuth ICP criteria
const PERFECT_FIT = {
  industries: ['gaming', 'fintech', 'crypto', 'cryptocurrency', 'blockchain', 'banking', 'payments', 'gambling', 'betting', 'casino'],
  keywords: ['authentication', 'verification', 'otp', 'sms', 'phone', 'login', 'signup', 'account', 'security', 'fraud', 'identity']
};

const GOOD_FIT = {
  industries: ['ecommerce', 'marketplace', 'saas', 'technology', 'developer', 'social', 'dating', 'delivery', 'logistics', 'travel', 'healthcare', 'insurance', 'edtech'],
  keywords: ['b2c', 'consumer', 'app', 'mobile', 'users', 'subscribers', 'customers']
};

const NOT_FIT = {
  industries: ['b2b', 'enterprise software', 'mining', 'manufacturing', 'industrial', 'agriculture', 'construction', 'medical devices'],
  keywords: ['b2b only', 'enterprise only', 'no consumers', 'mining', 'industrial']
};

function analyzeFit(lead) {
  const company = (lead.lead_company || '').toLowerCase();
  const industry = (lead.companyInfo?.industry || '').toLowerCase();
  const domain = (lead.lead_email || '').split('@')[1] || '';
  
  // Known perfect fits
  const perfectCompanies = ['stillfront', 'unity', 'paradox', 'carry1st', 'poki', 'crunchyroll', 'kinguin', 'rainbet', 'candivore', 'owlcat', 'coatsink', 'outfit7', 'eneba', 'solsten'];
  const goodCompanies = ['replit', 'udemy', 'naver', 'preply', 'omio', 'beehiiv', 'doist', 'spothero', 'air up', 'goodeggs'];
  const notFitCompanies = ['coppernicometals', 'urunn', 'sombrero', 'umiasalud', 'thermalradar', 'circlesecurity'];
  
  // Check against known lists
  for (const c of perfectCompanies) {
    if (company.includes(c)) return { fit: 'PERFECT', reason: 'Gaming/Consumer platform - high SMS/OTP potential' };
  }
  for (const c of goodCompanies) {
    if (company.includes(c)) return { fit: 'GOOD', reason: 'Consumer SaaS - likely has user auth needs' };
  }
  for (const c of notFitCompanies) {
    if (company.includes(c)) return { fit: 'NOT_FIT', reason: 'B2B/Industrial - no consumer auth needs' };
  }
  
  // Check industry signals
  for (const i of PERFECT_FIT.industries) {
    if (industry.includes(i) || company.includes(i)) {
      return { fit: 'PERFECT', reason: `${i} industry - core GAuth ICP` };
    }
  }
  
  for (const i of GOOD_FIT.industries) {
    if (industry.includes(i) || company.includes(i)) {
      return { fit: 'GOOD', reason: `${i} - potential fit` };
    }
  }
  
  for (const i of NOT_FIT.industries) {
    if (industry.includes(i) || company.includes(i)) {
      return { fit: 'NOT_FIT', reason: `${i} - outside ICP` };
    }
  }
  
  // Default based on reply type
  if (lead.reply_category === 'Meeting Booked') {
    return { fit: 'GOOD', reason: 'Already booked - qualified interest' };
  }
  
  return { fit: 'RESEARCH', reason: 'Needs manual review' };
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
    tier: lead.companyInfo?.tier || 'Unknown',
    fit: analysis.fit,
    reason: analysis.reason,
    score: lead.score
  };
});

// Sort by fit level
const fitOrder = { 'PERFECT': 1, 'GOOD': 2, 'RESEARCH': 3, 'NOT_FIT': 4 };
results.sort((a, b) => fitOrder[a.fit] - fitOrder[b.fit] || b.score - a.score);

// Generate CSV
const headers = ['Name', 'Company', 'Email', 'Status', 'Industry', 'Tier', 'GAuth Fit', 'Reason', 'Score'];
let csv = headers.join(',') + '\n';
results.forEach(r => {
  csv += [r.name, r.company, r.email, r.status, r.industry, r.tier, r.fit, `"${r.reason}"`, r.score].join(',') + '\n';
});

fs.writeFileSync('gauth-fit-analysis.csv', csv);
console.log('Saved to gauth-fit-analysis.csv');
console.log('\nSummary:');
console.log('PERFECT:', results.filter(r => r.fit === 'PERFECT').length);
console.log('GOOD:', results.filter(r => r.fit === 'GOOD').length);
console.log('RESEARCH:', results.filter(r => r.fit === 'RESEARCH').length);
console.log('NOT_FIT:', results.filter(r => r.fit === 'NOT_FIT').length);

// Show first 20
console.log('\n=== TOP 20 RESULTS ===');
results.slice(0, 20).forEach((r, i) => {
  console.log(`${i+1}. [${r.fit}] ${r.name} @ ${r.company} - ${r.reason}`);
});
