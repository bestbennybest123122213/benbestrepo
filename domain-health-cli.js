#!/usr/bin/env node
/**
 * Domain Health CLI - Fetches domain health data via SmartLead CLI
 * 
 * Usage: node domain-health-cli.js [--refresh]
 * 
 * Data Sources:
 * 1. smartlead mailboxes list-all → All mailboxes with emails
 * 2. smartlead analytics provider-perf → Gmail vs Outlook stats
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_FILE = path.join(DATA_DIR, 'cli-domain-health.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Execute CLI command and parse JSON output
 */
function runCLI(command) {
  try {
    const output = execSync(command, { 
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large outputs
      timeout: 120000 // 2 minute timeout
    });
    // Strip any warning lines before the JSON
    const jsonStart = output.indexOf('[');
    const jsonStartObj = output.indexOf('{');
    const start = jsonStart === -1 ? jsonStartObj : 
                  jsonStartObj === -1 ? jsonStart : 
                  Math.min(jsonStart, jsonStartObj);
    if (start === -1) {
      console.error('No JSON found in output');
      return null;
    }
    return JSON.parse(output.slice(start));
  } catch (error) {
    console.error(`CLI command failed: ${command}`);
    console.error(error.message);
    return null;
  }
}

/**
 * Extract domain from email address
 */
function extractDomain(email) {
  if (!email || typeof email !== 'string') return 'unknown';
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : 'unknown';
}

/**
 * Determine provider from mailbox type
 */
function getProvider(mailbox) {
  const type = (mailbox.type || '').toUpperCase();
  if (type.includes('GMAIL') || type.includes('GOOGLE')) return 'GMAIL';
  if (type.includes('OUTLOOK') || type.includes('MICROSOFT') || type.includes('O365')) return 'OUTLOOK';
  return 'OTHER';
}

/**
 * Calculate status based on bounce rate
 */
function getStatus(bounceRate) {
  if (bounceRate < 2) return 'healthy';
  if (bounceRate <= 3) return 'warning';
  return 'replace';
}

/**
 * Get status emoji
 */
function getStatusEmoji(status) {
  switch (status) {
    case 'healthy': return '✅';
    case 'warning': return '⚠️';
    case 'replace': return '🔴';
    default: return '❓';
  }
}

/**
 * Main function to fetch and process domain health data
 */
async function fetchDomainHealth() {
  console.log('🔄 Fetching domain health data via SmartLead CLI...\n');
  
  // Step 1: Fetch all mailboxes
  console.log('📬 Fetching mailboxes...');
  const mailboxes = runCLI('smartlead mailboxes list-all --format json 2>/dev/null');
  
  if (!mailboxes || !Array.isArray(mailboxes)) {
    console.error('❌ Failed to fetch mailboxes');
    process.exit(1);
  }
  console.log(`   Found ${mailboxes.length} mailboxes`);
  
  // Step 2: Fetch provider performance (last 90 days)
  console.log('📊 Fetching provider performance...');
  const today = new Date();
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const fromDate = ninetyDaysAgo.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];
  
  const providerPerfRaw = runCLI(
    `smartlead analytics provider-perf --from ${fromDate} --to ${toDate} --format json 2>/dev/null`
  );
  
  // Step 3: Process mailboxes by domain
  console.log('🔢 Processing domains...');
  const domainMap = new Map();
  
  for (const mailbox of mailboxes) {
    const email = mailbox.from_email || mailbox.username;
    const domain = extractDomain(email);
    const provider = getProvider(mailbox);
    const warmupStatus = mailbox.warmup_details?.status || 'UNKNOWN';
    const warmupRep = mailbox.warmup_details?.warmup_reputation || 'N/A';
    
    if (!domainMap.has(domain)) {
      domainMap.set(domain, {
        domain,
        mailboxes: 0,
        providers: {},
        warmupActive: 0,
        warmupPaused: 0,
        warmupDisabled: 0,
        accounts: []
      });
    }
    
    const domainData = domainMap.get(domain);
    domainData.mailboxes++;
    domainData.providers[provider] = (domainData.providers[provider] || 0) + 1;
    
    if (warmupStatus === 'ACTIVE') domainData.warmupActive++;
    else if (warmupStatus === 'PAUSED') domainData.warmupPaused++;
    else domainData.warmupDisabled++;
    
    domainData.accounts.push({
      email,
      provider,
      warmupStatus,
      warmupReputation: warmupRep,
      smtpOk: mailbox.is_smtp_success,
      imapOk: mailbox.is_imap_success,
      campaignCount: mailbox.campaign_count || 0
    });
  }
  
  // Step 4: Process provider performance data
  let providers = {};
  if (providerPerfRaw?.data?.email_providers_performance_overview?.overall) {
    const overall = providerPerfRaw.data.email_providers_performance_overview.overall;
    for (const p of overall) {
      const sent = p.sent || 0;
      const bounced = p.bounced || 0;
      const replied = p.replied || 0;
      const bounceRate = sent > 0 ? ((bounced / sent) * 100).toFixed(2) : '0.00';
      const replyRate = sent > 0 ? ((replied / sent) * 100).toFixed(2) : '0.00';
      
      providers[p.email_provider] = {
        sent,
        replied,
        bounced,
        opened: p.opened || 0,
        clicked: p.clicked || 0,
        bounceRate: `${bounceRate}%`,
        replyRate: `${replyRate}%`,
        status: getStatus(parseFloat(bounceRate))
      };
    }
  }
  
  // Step 5: Build domains array with status
  const domains = [];
  for (const [domain, data] of domainMap) {
    // Determine primary provider (most mailboxes)
    let primaryProvider = 'OTHER';
    let maxCount = 0;
    for (const [provider, count] of Object.entries(data.providers)) {
      if (count > maxCount) {
        maxCount = count;
        primaryProvider = provider;
      }
    }
    
    // Get status from provider stats if available
    const providerStats = providers[primaryProvider];
    const status = providerStats ? providerStats.status : 'unknown';
    
    domains.push({
      domain,
      mailboxes: data.mailboxes,
      provider: primaryProvider,
      providers: data.providers,
      warmup: {
        active: data.warmupActive,
        paused: data.warmupPaused,
        disabled: data.warmupDisabled
      },
      status,
      statusEmoji: getStatusEmoji(status)
    });
  }
  
  // Sort by mailbox count descending
  domains.sort((a, b) => b.mailboxes - a.mailboxes);
  
  // Step 6: Build final output
  const output = {
    generatedAt: new Date().toISOString(),
    dateRange: {
      from: fromDate,
      to: toDate
    },
    summary: {
      totalMailboxes: mailboxes.length,
      totalDomains: domains.length,
      byProvider: {
        GMAIL: domains.filter(d => d.provider === 'GMAIL').length,
        OUTLOOK: domains.filter(d => d.provider === 'OUTLOOK').length,
        OTHER: domains.filter(d => d.provider === 'OTHER').length
      },
      byStatus: {
        healthy: domains.filter(d => d.status === 'healthy').length,
        warning: domains.filter(d => d.status === 'warning').length,
        replace: domains.filter(d => d.status === 'replace').length,
        unknown: domains.filter(d => d.status === 'unknown').length
      }
    },
    providers,
    domains
  };
  
  // Step 7: Save to file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved to ${OUTPUT_FILE}`);
  
  // Step 8: Print summary
  console.log('\n📊 DOMAIN HEALTH SUMMARY');
  console.log('========================\n');
  
  console.log('📬 Provider Performance (Last 90 Days):');
  for (const [provider, stats] of Object.entries(providers)) {
    const emoji = getStatusEmoji(stats.status);
    console.log(`   ${emoji} ${provider}: ${stats.sent.toLocaleString()} sent, ${stats.bounced} bounced (${stats.bounceRate}), ${stats.replied} replies (${stats.replyRate})`);
  }
  
  console.log('\n🏷️  Status Summary:');
  console.log(`   ✅ Healthy: ${output.summary.byStatus.healthy} domains`);
  console.log(`   ⚠️  Warning: ${output.summary.byStatus.warning} domains`);
  console.log(`   🔴 Replace: ${output.summary.byStatus.replace} domains`);
  
  console.log('\n📁 Top Domains by Mailbox Count:');
  for (const domain of domains.slice(0, 10)) {
    console.log(`   ${domain.statusEmoji} ${domain.domain}: ${domain.mailboxes} mailboxes (${domain.provider})`);
  }
  
  return output;
}

// Run if called directly
if (require.main === module) {
  fetchDomainHealth()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Error:', err);
      process.exit(1);
    });
}

module.exports = { fetchDomainHealth };
