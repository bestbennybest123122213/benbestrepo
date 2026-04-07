/**
 * Bull BRO Health Monitor
 * Checks SmartLead, Anthropic, Database connectivity
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = __dirname;
const PARENT_DIR = path.dirname(__dirname);

// Read config from parent directory
const getConfig = () => {
  try {
    const configPath = path.join(PARENT_DIR, 'config.json');
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {}
  return {};
};

// Simple HTTP check
const checkEndpoint = (url, headers = {}) => {
  return new Promise((resolve) => {
    const start = Date.now();
    const urlObj = new URL(url);
    
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers,
      timeout: 10000
    }, (res) => {
      resolve({
        status: res.statusCode < 400 ? 'ok' : 'error',
        latency: Date.now() - start,
        statusCode: res.statusCode
      });
    });
    
    req.on('error', (e) => {
      resolve({
        status: 'error',
        latency: Date.now() - start,
        error: e.message
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 'error',
        latency: Date.now() - start,
        error: 'timeout'
      });
    });
    
    req.end();
  });
};

// Check SmartLead API
const checkSmartLead = async () => {
  const config = getConfig();
  const apiKey = config.smartlead?.apiKey || process.env.SMARTLEAD_API_KEY;
  
  if (!apiKey) {
    return { status: 'unknown', error: 'No API key configured' };
  }
  
  return checkEndpoint(`https://server.smartlead.ai/api/v1/campaigns?api_key=${apiKey}`);
};

// Check Anthropic API
const checkAnthropic = async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    return { status: 'unknown', error: 'No API key configured' };
  }
  
  // Just check if we can reach the API (don't make actual call)
  return checkEndpoint('https://api.anthropic.com/v1/messages', {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  });
};

// Check disk space
const checkDisk = () => {
  try {
    const { execSync } = require('child_process');
    const output = execSync('df -g . | tail -1').toString();
    const parts = output.trim().split(/\s+/);
    const freeGB = parseInt(parts[3]) || 0;
    
    return {
      status: freeGB > 5 ? 'ok' : freeGB > 1 ? 'warning' : 'error',
      freeGB
    };
  } catch (e) {
    return { status: 'unknown', error: e.message };
  }
};

// Run all checks
const runHealthCheck = async () => {
  console.log('🐂 Bull BRO Health Check');
  console.log('========================\n');
  
  const results = {
    lastCheck: new Date().toISOString(),
    smartlead: await checkSmartLead(),
    anthropic: await checkAnthropic(),
    disk: checkDisk()
  };
  
  // Display results
  const statusIcon = (s) => s === 'ok' ? '✅' : s === 'warning' ? '⚠️' : s === 'error' ? '❌' : '❓';
  
  console.log(`SmartLead: ${statusIcon(results.smartlead.status)} ${results.smartlead.status}`);
  if (results.smartlead.latency) console.log(`  Latency: ${results.smartlead.latency}ms`);
  if (results.smartlead.error) console.log(`  Error: ${results.smartlead.error}`);
  
  console.log(`\nAnthropic: ${statusIcon(results.anthropic.status)} ${results.anthropic.status}`);
  if (results.anthropic.latency) console.log(`  Latency: ${results.anthropic.latency}ms`);
  if (results.anthropic.error) console.log(`  Error: ${results.anthropic.error}`);
  
  console.log(`\nDisk: ${statusIcon(results.disk.status)} ${results.disk.status}`);
  if (results.disk.freeGB !== undefined) console.log(`  Free: ${results.disk.freeGB}GB`);
  
  // Save results
  fs.writeFileSync(
    path.join(DATA_DIR, 'health-status.json'),
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n✅ Health status saved to health-status.json');
  
  // Check for alerts
  const alerts = [];
  if (results.smartlead.status === 'error') alerts.push('SmartLead API is down');
  if (results.anthropic.status === 'error') alerts.push('Anthropic API is down');
  if (results.disk.status === 'error') alerts.push('Disk space critically low');
  
  if (alerts.length > 0) {
    console.log('\n⚠️ ALERTS:');
    alerts.forEach(a => console.log(`  - ${a}`));
    
    // Save alerts
    const alertsFile = path.join(DATA_DIR, 'alerts.json');
    let existingAlerts = [];
    try { existingAlerts = JSON.parse(fs.readFileSync(alertsFile, 'utf8')); } catch {}
    existingAlerts.unshift({
      timestamp: new Date().toISOString(),
      alerts
    });
    if (existingAlerts.length > 100) existingAlerts.length = 100;
    fs.writeFileSync(alertsFile, JSON.stringify(existingAlerts, null, 2));
  }
  
  return results;
};

// Watch mode - check every 5 minutes
const watchMode = async () => {
  console.log('🐂 Bull BRO Health Monitor - Watch Mode');
  console.log('Checking every 5 minutes. Press Ctrl+C to stop.\n');
  
  await runHealthCheck();
  
  setInterval(async () => {
    console.log('\n--- ' + new Date().toISOString() + ' ---\n');
    await runHealthCheck();
  }, 5 * 60 * 1000);
};

// Show status from last check
const showStatus = () => {
  const statusPath = path.join(DATA_DIR, 'health-status.json');
  
  if (!fs.existsSync(statusPath)) {
    console.log('No health status found. Run: node health-monitor.js check');
    return;
  }
  
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  const lastCheck = new Date(status.lastCheck);
  const ageMinutes = Math.round((Date.now() - lastCheck) / 1000 / 60);
  
  console.log('🐂 Bull BRO Health Status');
  console.log(`Last check: ${ageMinutes} minutes ago\n`);
  
  const statusIcon = (s) => s === 'ok' ? '✅' : s === 'warning' ? '⚠️' : s === 'error' ? '❌' : '❓';
  
  if (status.smartlead) {
    console.log(`SmartLead: ${statusIcon(status.smartlead.status)} ${status.smartlead.status}`);
    if (status.smartlead.latency) console.log(`  Latency: ${status.smartlead.latency}ms`);
  }
  
  if (status.anthropic) {
    console.log(`Anthropic: ${statusIcon(status.anthropic.status)} ${status.anthropic.status}`);
    if (status.anthropic.latency) console.log(`  Latency: ${status.anthropic.latency}ms`);
  }
  
  if (status.disk) {
    console.log(`Disk: ${statusIcon(status.disk.status)} ${status.disk.status}`);
    if (status.disk.freeGB !== undefined) console.log(`  Free: ${status.disk.freeGB}GB`);
  }
};

// Show alerts
const showAlerts = () => {
  const alertsPath = path.join(DATA_DIR, 'alerts.json');
  
  if (!fs.existsSync(alertsPath)) {
    console.log('No alerts recorded.');
    return;
  }
  
  const alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
  
  if (alerts.length === 0) {
    console.log('No alerts recorded.');
    return;
  }
  
  console.log('🚨 Bull BRO Alerts\n');
  
  alerts.slice(0, 10).forEach(a => {
    const time = new Date(a.timestamp).toLocaleString();
    console.log(`${time}:`);
    a.alerts.forEach(alert => console.log(`  - ${alert}`));
    console.log('');
  });
  
  console.log(`Showing ${Math.min(10, alerts.length)} of ${alerts.length} alerts`);
};

// CLI
const command = process.argv[2];

switch (command) {
  case 'check':
    runHealthCheck().then(() => process.exit(0));
    break;
  case 'watch':
    watchMode();
    break;
  case 'status':
    showStatus();
    break;
  case 'alerts':
    showAlerts();
    break;
  default:
    console.log('🐂 Bull BRO Health Monitor');
    console.log('==========================\n');
    console.log('Commands:');
    console.log('  node health-monitor.js check   Run once and exit');
    console.log('  node health-monitor.js watch   Run continuously every 5 minutes');
    console.log('  node health-monitor.js status  Show last health status');
    console.log('  node health-monitor.js alerts  Show recent alerts');
}

module.exports = { runHealthCheck, checkSmartLead, checkAnthropic, checkDisk, showStatus, showAlerts };
