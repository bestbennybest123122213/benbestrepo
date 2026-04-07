#!/usr/bin/env node
/**
 * Performance Alert System
 * Compares current metrics to historical averages and flags declines
 * 
 * Usage:
 *   node performance-alert.js              # Full analysis
 *   node performance-alert.js --quick      # Just alerts (for automation)
 *   node performance-alert.js --telegram   # Telegram-ready format
 */

const fs = require('fs');
const path = require('path');

// Colors
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// Load global analytics data
function loadAnalyticsData() {
    const dataDir = path.join(__dirname, 'data');
    
    // Load the latest combined file
    const latestFile = path.join(dataDir, 'global-analytics-latest.json');
    if (fs.existsSync(latestFile)) {
        return JSON.parse(fs.readFileSync(latestFile));
    }
    
    // Fallback: load individual period files
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('global-analytics-'));
    if (files.length === 0) {
        console.error('No analytics data found. Run the scraper first.');
        process.exit(1);
    }
    
    const data = {};
    ['7d', '30d', '60d', '90d'].forEach(period => {
        const file = files.find(f => f.includes(period));
        if (file) {
            data[period] = JSON.parse(fs.readFileSync(path.join(dataDir, file)));
        }
    });
    
    return data;
}

// Calculate alert thresholds
function analyzePerformance(data) {
    const alerts = [];
    const metrics = [];
    
    // Extract period data
    let p7d, p30d, p60d, p90d;
    
    if (data.periods) {
        // Combined format from scraper
        const raw7d = data.periods['last_7_days'] || data.periods['7d'];
        const raw30d = data.periods['last_30_days'] || data.periods['30d'];
        const raw60d = data.periods['last_60_days'] || data.periods['60d'];
        const raw90d = data.periods['last_90_days'] || data.periods['90d'];
        
        // Normalize to common format
        p7d = raw7d?.summary ? {
            sent: raw7d.summary.emailsSent,
            replied: raw7d.summary.replied,
            positive: raw7d.summary.positiveReply,
            bounced: raw7d.summary.bounced
        } : raw7d;
        
        p30d = raw30d?.summary ? {
            sent: raw30d.summary.emailsSent,
            replied: raw30d.summary.replied,
            positive: raw30d.summary.positiveReply,
            bounced: raw30d.summary.bounced
        } : raw30d;
        
        p60d = raw60d?.summary ? {
            sent: raw60d.summary.emailsSent,
            replied: raw60d.summary.replied,
            positive: raw60d.summary.positiveReply,
            bounced: raw60d.summary.bounced
        } : raw60d;
        
        p90d = raw90d?.summary ? {
            sent: raw90d.summary.emailsSent,
            replied: raw90d.summary.replied,
            positive: raw90d.summary.positiveReply,
            bounced: raw90d.summary.bounced
        } : raw90d;
    } else {
        // Individual files format
        p7d = data['7d'];
        p30d = data['30d'];
        p60d = data['60d'];
        p90d = data['90d'];
    }
    
    if (!p7d || !p30d || !p90d) {
        console.error('Missing period data. Run scraper first.');
        process.exit(1);
    }
    
    // Calculate rates
    const rate7d = p7d.replied / p7d.sent * 100;
    const rate30d = p30d.replied / p30d.sent * 100;
    const rate90d = p90d.replied / p90d.sent * 100;
    
    metrics.push({
        name: 'Reply Rate',
        current: rate7d,
        avg30d: rate30d,
        avg90d: rate90d,
        unit: '%',
        threshold: 50 // Alert if current is <50% of avg
    });
    
    // Positive rate
    const posRate7d = p7d.positive / p7d.sent * 100;
    const posRate30d = p30d.positive / p30d.sent * 100;
    const posRate90d = p90d.positive / p90d.sent * 100;
    
    metrics.push({
        name: 'Positive Rate',
        current: posRate7d,
        avg30d: posRate30d,
        avg90d: posRate90d,
        unit: '%',
        threshold: 50
    });
    
    // Scaling ratio (emails per positive)
    const scale7d = p7d.positive > 0 ? p7d.sent / p7d.positive : Infinity;
    const scale30d = p30d.positive > 0 ? p30d.sent / p30d.positive : Infinity;
    const scale90d = p90d.positive > 0 ? p90d.sent / p90d.positive : Infinity;
    
    metrics.push({
        name: 'Scaling Ratio',
        current: scale7d,
        avg30d: scale30d,
        avg90d: scale90d,
        unit: ':1',
        threshold: 200, // Alert if ratio doubled (worse)
        inverse: true // Higher is worse
    });
    
    // Generate alerts
    metrics.forEach(m => {
        let severity = 'ok';
        let message = '';
        
        if (m.inverse) {
            // Higher is worse (like scaling ratio)
            if (m.current > m.avg90d * 2) {
                severity = 'critical';
                message = `${m.name} is 2x worse than 90-day average`;
            } else if (m.current > m.avg30d * 1.5) {
                severity = 'warning';
                message = `${m.name} is declining`;
            }
        } else {
            // Lower is worse (like reply rate)
            if (m.avg90d > 0 && m.current < m.avg90d * 0.25) {
                severity = 'critical';
                message = `${m.name} is 75%+ below 90-day average`;
            } else if (m.avg30d > 0 && m.current < m.avg30d * 0.5) {
                severity = 'warning';
                message = `${m.name} is 50%+ below 30-day average`;
            }
        }
        
        if (severity !== 'ok') {
            alerts.push({
                severity,
                metric: m.name,
                current: m.current,
                avg: m.avg90d,
                message,
                unit: m.unit
            });
        }
    });
    
    return { metrics, alerts, data: { p7d, p30d, p90d } };
}

// Display full analysis
function displayFull(analysis) {
    const { metrics, alerts, data } = analysis;
    
    console.log(`\n${BOLD}╔══════════════════════════════════════════════════════════════════════════╗${RESET}`);
    console.log(`${BOLD}║  📊 PERFORMANCE TREND ANALYSIS                                          ║${RESET}`);
    console.log(`${BOLD}╚══════════════════════════════════════════════════════════════════════════╝${RESET}\n`);
    
    // Summary
    if (alerts.length === 0) {
        console.log(`${GREEN}✓ All metrics within normal range${RESET}\n`);
    } else {
        const critical = alerts.filter(a => a.severity === 'critical').length;
        const warning = alerts.filter(a => a.severity === 'warning').length;
        
        if (critical > 0) {
            console.log(`${RED}🚨 ${critical} CRITICAL ALERT${critical > 1 ? 'S' : ''}${RESET}`);
        }
        if (warning > 0) {
            console.log(`${YELLOW}⚠️  ${warning} WARNING${warning > 1 ? 'S' : ''}${RESET}`);
        }
        console.log();
    }
    
    // Metrics comparison
    console.log(`${BOLD}📈 METRICS COMPARISON${RESET}`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`${DIM}Metric${' '.repeat(20)}7-Day${' '.repeat(8)}30-Day${' '.repeat(7)}90-Day${RESET}`);
    console.log(`${'─'.repeat(70)}`);
    
    metrics.forEach(m => {
        const name = m.name.padEnd(25);
        const c = formatValue(m.current, m.unit);
        const a30 = formatValue(m.avg30d, m.unit);
        const a90 = formatValue(m.avg90d, m.unit);
        
        // Color based on trend
        let color = '';
        if (m.inverse) {
            color = m.current > m.avg90d * 1.5 ? RED : (m.current < m.avg90d * 0.8 ? GREEN : '');
        } else {
            color = m.current < m.avg90d * 0.5 ? RED : (m.current > m.avg90d * 1.2 ? GREEN : '');
        }
        
        console.log(`${name}${color}${c.padStart(10)}${RESET}${a30.padStart(12)}${a90.padStart(12)}`);
    });
    
    // Alerts detail
    if (alerts.length > 0) {
        console.log(`\n${BOLD}🚨 ALERTS${RESET}`);
        console.log(`${'─'.repeat(70)}`);
        
        alerts.forEach(a => {
            const icon = a.severity === 'critical' ? `${RED}🔴` : `${YELLOW}⚠️`;
            console.log(`${icon} ${a.message}${RESET}`);
            console.log(`   ${DIM}Current: ${formatValue(a.current, a.unit)} | 90-day avg: ${formatValue(a.avg, a.unit)}${RESET}`);
        });
    }
    
    // Recommendations
    console.log(`\n${BOLD}💡 RECOMMENDATIONS${RESET}`);
    console.log(`${'─'.repeat(70)}`);
    
    if (alerts.some(a => a.metric === 'Reply Rate')) {
        console.log(`   1. Check domain health: ${CYAN}gex domains${RESET}`);
        console.log(`   2. Pause zero-reply accounts: ${CYAN}gex accounts --action${RESET}`);
    }
    
    if (alerts.some(a => a.metric === 'Positive Rate')) {
        console.log(`   3. Review email copy: Are subject lines working?`);
        console.log(`   4. Check lead quality: ${CYAN}gex campaign-dx${RESET}`);
    }
    
    if (alerts.some(a => a.metric === 'Scaling Ratio')) {
        console.log(`   5. Increase volume on winning campaigns: ${CYAN}gex volume --scale${RESET}`);
    }
    
    if (alerts.length === 0) {
        console.log(`   Keep doing what you're doing. Monitor weekly.`);
    }
    
    console.log(`\n${'═'.repeat(70)}`);
}

// Display quick alerts only
function displayQuick(analysis) {
    const { alerts } = analysis;
    
    if (alerts.length === 0) {
        console.log(`${GREEN}✓ Performance OK${RESET}`);
        return;
    }
    
    alerts.forEach(a => {
        const icon = a.severity === 'critical' ? '🔴' : '⚠️';
        console.log(`${icon} ${a.message}`);
    });
}

// Telegram format
function displayTelegram(analysis) {
    const { alerts, data } = analysis;
    
    console.log(`📊 *PERFORMANCE ALERT*\n`);
    
    if (alerts.length === 0) {
        console.log(`✅ All metrics normal\n`);
    } else {
        alerts.forEach(a => {
            const icon = a.severity === 'critical' ? '🔴' : '⚠️';
            console.log(`${icon} ${a.message}`);
        });
        console.log();
    }
    
    // Quick stats
    console.log(`*7-Day Stats:*`);
    console.log(`Sent: ${data.p7d.sent.toLocaleString()}`);
    console.log(`Replied: ${data.p7d.replied}`);
    console.log(`Positive: ${data.p7d.positive}`);
    
    if (alerts.length > 0) {
        console.log(`\n⚡ Run \`gex perf\` for full analysis`);
    }
}

// Helper to format values
function formatValue(val, unit) {
    if (val === Infinity) return '∞';
    if (unit === '%') return val.toFixed(2) + '%';
    if (unit === ':1') return '1:' + Math.round(val);
    return val.toFixed(2);
}

// Main
function main() {
    const args = process.argv.slice(2);
    const QUICK = args.includes('--quick') || args.includes('-q');
    const TELEGRAM = args.includes('--telegram') || args.includes('--tg');
    
    const data = loadAnalyticsData();
    const analysis = analyzePerformance(data);
    
    if (TELEGRAM) {
        displayTelegram(analysis);
    } else if (QUICK) {
        displayQuick(analysis);
    } else {
        displayFull(analysis);
    }
}

main();
