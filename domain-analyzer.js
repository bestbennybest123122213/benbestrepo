#!/usr/bin/env node
/**
 * Domain Analyzer - Eric's Framework
 * 
 * Analyzes domains using Eric Mavislavski's cold email SOP:
 * - < 1% reply rate over 200+ sent = REPLACE
 * - < 200 sent = TOO EARLY to decide
 * - 0.9-0.99% = WATCH (borderline)
 * - ≥ 1% = KEEP
 * 
 * Usage:
 *   node domain-analyzer.js              # Full analysis
 *   node domain-analyzer.js --replace    # Only show domains to replace
 *   node domain-analyzer.js --watch      # Only show borderline domains
 *   node domain-analyzer.js --telegram   # Telegram-friendly format
 *   node domain-analyzer.js --export     # Export CSV for action
 */

const fs = require('fs');
const path = require('path');

// Configuration - Eric's thresholds
const CONFIG = {
  MIN_SENT_FOR_DECISION: 200,    // Need 200+ emails to make a decision
  REPLACE_THRESHOLD: 1.0,        // Below 1% = replace
  WATCH_THRESHOLD_LOW: 0.9,      // 0.9-0.99% = watch
  GOOD_THRESHOLD: 2.0,           // 2%+ = good
};

// Load 20D data (or fallback to other sources)
function loadDomainData() {
  const dataDir = path.join(__dirname, 'data');
  
  // Try 20D data first (Jan's SmartLead export)
  const file20d = path.join(dataDir, '20d-domain-lookup.json');
  if (fs.existsSync(file20d)) {
    const data = JSON.parse(fs.readFileSync(file20d, 'utf8'));
    return {
      source: '20D SmartLead Export',
      period: '20 days',
      domains: Object.entries(data).map(([domain, stats]) => ({
        domain,
        sent: stats.sent_20d,
        replies: stats.replies_20d,
        replyRate: stats.reply_rate_20d
      }))
    };
  }
  
  // Fallback to Jan's domain lookup (has multiple periods)
  const janFile = path.join(dataDir, 'jan-domain-lookup.json');
  if (fs.existsSync(janFile)) {
    const data = JSON.parse(fs.readFileSync(janFile, 'utf8'));
    return {
      source: 'Jan Google Sheet',
      period: '30 days',
      domains: Object.entries(data).map(([domain, periods]) => ({
        domain,
        sent: periods['30d']?.sent || 0,
        replies: periods['30d']?.replied || 0,
        replyRate: periods['30d']?.reply_rate || 0
      }))
    };
  }
  
  console.error('No domain data found. Run data sync first.');
  process.exit(1);
}

// Categorize a domain using Eric's framework
function categorize(domain) {
  const { sent, replyRate } = domain;
  
  if (sent < CONFIG.MIN_SENT_FOR_DECISION) {
    return { category: 'TOO_EARLY', reason: `Only ${sent} sent (need ${CONFIG.MIN_SENT_FOR_DECISION}+)` };
  }
  
  if (replyRate === 0) {
    return { category: 'REPLACE', reason: 'Zero replies - dead domain', severity: 'critical' };
  }
  
  if (replyRate < CONFIG.WATCH_THRESHOLD_LOW) {
    return { category: 'REPLACE', reason: `${replyRate.toFixed(2)}% reply rate`, severity: 'high' };
  }
  
  if (replyRate < CONFIG.REPLACE_THRESHOLD) {
    return { category: 'WATCH', reason: `${replyRate.toFixed(2)}% - borderline, monitor closely` };
  }
  
  if (replyRate >= CONFIG.GOOD_THRESHOLD) {
    return { category: 'KEEP', reason: `${replyRate.toFixed(2)}% - performing well`, status: 'good' };
  }
  
  return { category: 'KEEP', reason: `${replyRate.toFixed(2)}% - acceptable` };
}

// Analyze all domains
function analyze(data) {
  const results = {
    source: data.source,
    period: data.period,
    analyzed: new Date().toISOString(),
    summary: { replace: 0, watch: 0, keep: 0, tooEarly: 0 },
    domains: {
      replace: [],
      watch: [],
      keep: [],
      tooEarly: []
    }
  };
  
  for (const domain of data.domains) {
    const { category, reason, severity, status } = categorize(domain);
    const entry = { ...domain, reason, severity, status };
    
    switch (category) {
      case 'REPLACE':
        results.domains.replace.push(entry);
        results.summary.replace++;
        break;
      case 'WATCH':
        results.domains.watch.push(entry);
        results.summary.watch++;
        break;
      case 'KEEP':
        results.domains.keep.push(entry);
        results.summary.keep++;
        break;
      case 'TOO_EARLY':
        results.domains.tooEarly.push(entry);
        results.summary.tooEarly++;
        break;
    }
  }
  
  // Sort each category by reply rate (ascending for replace/watch, descending for keep)
  results.domains.replace.sort((a, b) => a.replyRate - b.replyRate);
  results.domains.watch.sort((a, b) => a.replyRate - b.replyRate);
  results.domains.keep.sort((a, b) => b.replyRate - a.replyRate);
  
  return results;
}

// Format output
function formatStandard(results) {
  const lines = [];
  
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('📊 DOMAIN ANALYZER - Eric\'s Framework');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`Source: ${results.source}`);
  lines.push(`Period: ${results.period}`);
  lines.push(`Analyzed: ${new Date(results.analyzed).toLocaleString()}`);
  lines.push('');
  lines.push(`Summary: ${results.summary.replace} REPLACE | ${results.summary.watch} WATCH | ${results.summary.keep} KEEP | ${results.summary.tooEarly} TOO EARLY`);
  lines.push('');
  
  if (results.domains.replace.length > 0) {
    lines.push('❌ REPLACE (< 1% reply rate with 200+ sent):');
    lines.push('───────────────────────────────────────────────────────────');
    for (const d of results.domains.replace) {
      const icon = d.replyRate === 0 ? '💀' : '🔴';
      lines.push(`  ${icon} ${d.domain.padEnd(35)} ${d.sent.toString().padStart(5)} sent | ${d.replyRate.toFixed(2).padStart(5)}% | ${d.reason}`);
    }
    lines.push('');
  }
  
  if (results.domains.watch.length > 0) {
    lines.push('⚠️  WATCH (0.9-0.99% - borderline):');
    lines.push('───────────────────────────────────────────────────────────');
    for (const d of results.domains.watch) {
      lines.push(`  🟡 ${d.domain.padEnd(35)} ${d.sent.toString().padStart(5)} sent | ${d.replyRate.toFixed(2).padStart(5)}%`);
    }
    lines.push('');
  }
  
  if (results.domains.keep.length > 0) {
    lines.push('✅ KEEP (≥ 1% reply rate):');
    lines.push('───────────────────────────────────────────────────────────');
    for (const d of results.domains.keep) {
      const icon = d.replyRate >= CONFIG.GOOD_THRESHOLD ? '🟢' : '✓';
      lines.push(`  ${icon} ${d.domain.padEnd(35)} ${d.sent.toString().padStart(5)} sent | ${d.replyRate.toFixed(2).padStart(5)}%`);
    }
    lines.push('');
  }
  
  if (results.domains.tooEarly.length > 0) {
    lines.push('⏸️  TOO EARLY (< 200 sent):');
    lines.push('───────────────────────────────────────────────────────────');
    for (const d of results.domains.tooEarly) {
      lines.push(`  ⏳ ${d.domain.padEnd(35)} ${d.sent.toString().padStart(5)} sent | ${d.replyRate.toFixed(2).padStart(5)}% | ${d.reason}`);
    }
    lines.push('');
  }
  
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('Eric\'s Rule: Replace domains with < 1% reply rate after 200+ emails');
  lines.push('═══════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}

function formatTelegram(results) {
  const lines = [];
  
  lines.push('📊 *Domain Check*');
  lines.push(`${results.summary.replace} replace | ${results.summary.watch} watch | ${results.summary.keep} keep`);
  lines.push('');
  
  if (results.domains.replace.length > 0) {
    lines.push('❌ *REPLACE:*');
    for (const d of results.domains.replace.slice(0, 10)) {
      lines.push(`• ${d.domain} (${d.replyRate.toFixed(2)}%)`);
    }
    if (results.domains.replace.length > 10) {
      lines.push(`... and ${results.domains.replace.length - 10} more`);
    }
    lines.push('');
  }
  
  if (results.domains.watch.length > 0) {
    lines.push('⚠️ *WATCH:*');
    for (const d of results.domains.watch) {
      lines.push(`• ${d.domain} (${d.replyRate.toFixed(2)}%)`);
    }
    lines.push('');
  }
  
  lines.push(`_Based on ${results.period} data_`);
  
  return lines.join('\n');
}

function formatCSV(results) {
  const lines = ['domain,sent,replies,reply_rate,category,action'];
  
  for (const d of results.domains.replace) {
    lines.push(`${d.domain},${d.sent},${d.replies},${d.replyRate},REPLACE,Pause and replace`);
  }
  for (const d of results.domains.watch) {
    lines.push(`${d.domain},${d.sent},${d.replies},${d.replyRate},WATCH,Monitor closely`);
  }
  for (const d of results.domains.keep) {
    lines.push(`${d.domain},${d.sent},${d.replies},${d.replyRate},KEEP,Continue`);
  }
  for (const d of results.domains.tooEarly) {
    lines.push(`${d.domain},${d.sent},${d.replies},${d.replyRate},TOO_EARLY,Wait for more data`);
  }
  
  return lines.join('\n');
}

// Main
function main() {
  const args = process.argv.slice(2);
  const showReplace = args.includes('--replace');
  const showWatch = args.includes('--watch');
  const telegram = args.includes('--telegram');
  const exportCsv = args.includes('--export');
  
  const data = loadDomainData();
  const results = analyze(data);
  
  if (exportCsv) {
    const csv = formatCSV(results);
    const exportPath = path.join(__dirname, 'exports', `domain-analysis-${new Date().toISOString().split('T')[0]}.csv`);
    fs.mkdirSync(path.dirname(exportPath), { recursive: true });
    fs.writeFileSync(exportPath, csv);
    console.log(`Exported to ${exportPath}`);
    return;
  }
  
  if (telegram) {
    console.log(formatTelegram(results));
    return;
  }
  
  if (showReplace) {
    console.log('❌ Domains to REPLACE:\n');
    for (const d of results.domains.replace) {
      console.log(`${d.domain} - ${d.replyRate.toFixed(2)}% (${d.sent} sent)`);
    }
    return;
  }
  
  if (showWatch) {
    console.log('⚠️ Domains to WATCH:\n');
    for (const d of results.domains.watch) {
      console.log(`${d.domain} - ${d.replyRate.toFixed(2)}% (${d.sent} sent)`);
    }
    return;
  }
  
  console.log(formatStandard(results));
}

main();
