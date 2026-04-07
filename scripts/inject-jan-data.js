// This script updates the server to use Jan's account data
const fs = require('fs');

const janData = JSON.parse(fs.readFileSync('data/jan-account-data.json', 'utf8'));

// Create account lookup by email
const accountLookup = {};
for (const acc of janData.accounts) {
  accountLookup[acc.email] = acc;
}

// Create domain lookup
const domainLookup = {};
for (const dom of janData.domains) {
  domainLookup[dom.domain] = dom;
}

// Save lookups for server use
fs.writeFileSync('data/jan-account-lookup.json', JSON.stringify(accountLookup, null, 2));
fs.writeFileSync('data/jan-domain-lookup.json', JSON.stringify(domainLookup, null, 2));

console.log('Created lookup files:');
console.log('- data/jan-account-lookup.json');
console.log('- data/jan-domain-lookup.json');
console.log(`\nReady: ${Object.keys(accountLookup).length} accounts, ${Object.keys(domainLookup).length} domains`);
