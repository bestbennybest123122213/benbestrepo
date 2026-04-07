const fs = require('fs');

const text = fs.readFileSync('data/jan-raw.csv', 'utf8');
const lines = text.split('\n').filter(l => l.trim());

// Skip header row
const dataLines = lines.slice(1);

const accountData = {};

// Parse "4.17% (5)" format - extract both percentage and count
function parseRateAndCount(str) {
  if (!str) return { rate: 0, count: 0 };
  const match = str.match(/([\d.]+)%\s*\((\d+)\)/);
  if (match) {
    return { rate: parseFloat(match[1]), count: parseInt(match[2]) };
  }
  return { rate: 0, count: 0 };
}

for (const line of dataLines) {
  const parts = line.split(',');
  
  // 7D data (indices 0-3): email, sent, reply%, positive%
  if (parts[0] && parts[0].includes('@')) {
    const email = parts[0].trim();
    const sent = parseInt(parts[1]) || 0;
    const reply = parseRateAndCount(parts[2]);
    const positive = parseRateAndCount(parts[3]);
    
    if (!accountData[email]) accountData[email] = {};
    accountData[email]['7d'] = { 
      sent, 
      replied: reply.count, 
      reply_rate: reply.rate,  // Use SmartLead's actual rate
      positive: positive.count 
    };
  }
  
  // 14D data (indices 5-8)
  if (parts[5] && parts[5].includes('@')) {
    const email = parts[5].trim();
    const sent = parseInt(parts[6]) || 0;
    const reply = parseRateAndCount(parts[7]);
    const positive = parseRateAndCount(parts[8]);
    
    if (!accountData[email]) accountData[email] = {};
    accountData[email]['14d'] = { 
      sent, 
      replied: reply.count, 
      reply_rate: reply.rate,
      positive: positive.count 
    };
  }
  
  // 30D data (indices 10-13)
  if (parts[10] && parts[10].includes('@')) {
    const email = parts[10].trim();
    const sent = parseInt(parts[11]) || 0;
    const reply = parseRateAndCount(parts[12]);
    const positive = parseRateAndCount(parts[13]);
    
    if (!accountData[email]) accountData[email] = {};
    accountData[email]['30d'] = { 
      sent, 
      replied: reply.count, 
      reply_rate: reply.rate,
      positive: positive.count 
    };
  }
  
  // 60D data (indices 15-18)
  if (parts[15] && parts[15].includes('@')) {
    const email = parts[15].trim();
    const sent = parseInt(parts[16]) || 0;
    const reply = parseRateAndCount(parts[17]);
    const positive = parseRateAndCount(parts[18]);
    
    if (!accountData[email]) accountData[email] = {};
    accountData[email]['60d'] = { 
      sent, 
      replied: reply.count, 
      reply_rate: reply.rate,
      positive: positive.count 
    };
  }
  
  // 90D data (indices 20-23)
  if (parts[20] && parts[20].includes('@')) {
    const email = parts[20].trim();
    const sent = parseInt(parts[21]) || 0;
    const reply = parseRateAndCount(parts[22]);
    const positive = parseRateAndCount(parts[23]);
    
    if (!accountData[email]) accountData[email] = {};
    accountData[email]['90d'] = { 
      sent, 
      replied: reply.count, 
      reply_rate: reply.rate,
      positive: positive.count 
    };
  }
}

// Convert to array format
const accounts = Object.entries(accountData).map(([email, periods]) => ({
  email,
  ...periods
}));

// Group by domain for summary - use weighted average for rates
const domainData = {};
for (const acc of accounts) {
  const domain = acc.email.split('@')[1];
  if (!domainData[domain]) {
    domainData[domain] = {
      domain,
      accounts: [],
      '7d': { sent: 0, replied: 0, positive: 0, totalRate: 0, rateCount: 0 },
      '14d': { sent: 0, replied: 0, positive: 0, totalRate: 0, rateCount: 0 },
      '30d': { sent: 0, replied: 0, positive: 0, totalRate: 0, rateCount: 0 },
      '60d': { sent: 0, replied: 0, positive: 0, totalRate: 0, rateCount: 0 },
      '90d': { sent: 0, replied: 0, positive: 0, totalRate: 0, rateCount: 0 }
    };
  }
  domainData[domain].accounts.push(acc);
  
  for (const period of ['7d', '14d', '30d', '60d', '90d']) {
    if (acc[period]) {
      domainData[domain][period].sent += acc[period].sent || 0;
      domainData[domain][period].replied += acc[period].replied || 0;
      domainData[domain][period].positive += acc[period].positive || 0;
      // Track rates for averaging (weighted by sent)
      if (acc[period].sent > 0 && acc[period].reply_rate !== undefined) {
        domainData[domain][period].totalRate += acc[period].reply_rate * acc[period].sent;
        domainData[domain][period].rateCount += acc[period].sent;
      }
    }
  }
}

// Calculate weighted average reply rates for domains
for (const domain of Object.values(domainData)) {
  for (const period of ['7d', '14d', '30d', '60d', '90d']) {
    if (domain[period].rateCount > 0) {
      domain[period].reply_rate = parseFloat((domain[period].totalRate / domain[period].rateCount).toFixed(2));
    } else {
      domain[period].reply_rate = 0;
    }
    delete domain[period].totalRate;
    delete domain[period].rateCount;
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  source: 'jan-google-sheet',
  totalAccounts: accounts.length,
  totalDomains: Object.keys(domainData).length,
  accounts,
  domains: Object.values(domainData)
};

fs.writeFileSync('data/jan-account-data.json', JSON.stringify(output, null, 2));

console.log(`Parsed ${accounts.length} accounts across ${Object.keys(domainData).length} domains`);

// Show sample with actual rate vs calculated
const sample = accounts.find(a => a['30d']?.replied > 0);
if (sample) {
  console.log('\nSample account with 30d data:');
  console.log(`Email: ${sample.email}`);
  console.log(`30d sent: ${sample['30d'].sent}`);
  console.log(`30d replied: ${sample['30d'].replied}`);
  console.log(`30d SmartLead rate: ${sample['30d'].reply_rate}%`);
  console.log(`30d calculated rate: ${(sample['30d'].replied / sample['30d'].sent * 100).toFixed(2)}%`);
}
