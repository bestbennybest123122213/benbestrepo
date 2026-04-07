#!/usr/bin/env node
/**
 * Health Monitor
 * 
 * Monitors system health and reports issues:
 * - Database connectivity
 * - API response times
 * - Data freshness
 * - Server status
 */

require('dotenv').config();
const http = require('http');
const { initSupabase } = require('./lib/supabase');

async function checkDatabase() {
  const start = Date.now();
  try {
    const client = initSupabase();
    if (!client) return { status: 'error', message: 'Client not initialized', time: 0 };
    
    const { error } = await client
      .from('positive_replies')
      .select('id')
      .limit(1);
    
    const time = Date.now() - start;
    
    if (error) {
      return { status: 'error', message: error.message, time };
    }
    
    return { status: 'ok', time };
  } catch (err) {
    return { status: 'error', message: err.message, time: Date.now() - start };
  }
}

async function checkServer(port = 3456) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/api/stats',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      const time = Date.now() - start;
      resolve({ status: res.statusCode === 200 ? 'ok' : 'error', code: res.statusCode, time });
    });
    
    req.on('error', (err) => {
      resolve({ status: 'error', message: err.message, time: Date.now() - start });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 'error', message: 'Timeout', time: 5000 });
    });
    
    req.end();
  });
}

async function checkDataFreshness() {
  try {
    const client = initSupabase();
    if (!client) return { status: 'error', message: 'Client not initialized' };
    
    const { data } = await client
      .from('positive_replies')
      .select('replied_at')
      .order('replied_at', { ascending: false })
      .limit(1);
    
    if (!data || data.length === 0) {
      return { status: 'warning', message: 'No data found' };
    }
    
    const lastReply = new Date(data[0].replied_at);
    const ageHours = (Date.now() - lastReply.getTime()) / (1000 * 60 * 60);
    
    if (ageHours > 168) { // 7 days
      return { status: 'warning', message: `Last reply ${Math.floor(ageHours / 24)} days ago` };
    }
    
    return { status: 'ok', lastReply: lastReply.toISOString(), ageHours: Math.floor(ageHours) };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
}

async function runHealthCheck() {
  console.log('\n🏥 Running Health Check...\n');
  
  const checks = {
    database: await checkDatabase(),
    server: await checkServer(),
    dataFreshness: await checkDataFreshness()
  };
  
  let allOk = true;
  
  Object.entries(checks).forEach(([name, result]) => {
    const icon = result.status === 'ok' ? '✅' : result.status === 'warning' ? '⚠️' : '❌';
    const time = result.time ? ` (${result.time}ms)` : '';
    const extra = result.message ? ` - ${result.message}` : '';
    
    console.log(`${icon} ${name.padEnd(15)}${time}${extra}`);
    
    if (result.status !== 'ok') allOk = false;
  });
  
  console.log('\n' + (allOk ? '✅ All systems healthy' : '⚠️ Some issues detected') + '\n');
  
  return { healthy: allOk, checks };
}

// Simple health check endpoint if run as server
function startHealthServer(port = 3458) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health' || req.url === '/') {
      const result = await runHealthCheck();
      res.writeHead(result.healthy ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });
  
  server.listen(port, '127.0.0.1', () => {
    console.log(`🏥 Health monitor running on http://localhost:${port}/health`);
  });
}

module.exports = { runHealthCheck, checkDatabase, checkServer, checkDataFreshness };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === 'server') {
    startHealthServer();
  } else {
    runHealthCheck();
  }
}
