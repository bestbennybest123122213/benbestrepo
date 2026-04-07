#!/usr/bin/env node
/**
 * Scrape Email Health Metrics from SmartLead GraphQL API
 * Uses JWT token from browser session
 * Fetches per-mailbox stats for 7d, 14d, 30d periods
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load token
const tokenPath = path.join(__dirname, '.smartlead-token');
const TOKEN = fs.readFileSync(tokenPath, 'utf8').trim();

// GraphQL endpoint
const GRAPHQL_URL = 'https://fe-gql.smartlead.ai/v1/graphql';

// Helper to make GraphQL requests
async function graphql(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    
    const options = {
      hostname: 'fe-gql.smartlead.ai',
      port: 443,
      path: '/v1/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (result.errors) {
            reject(new Error(JSON.stringify(result.errors)));
          } else {
            resolve(result.data);
          }
        } catch (e) {
          reject(new Error(`Parse error: ${body.slice(0, 500)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// First, let's introspect the schema to find available queries
async function introspectSchema() {
  const query = `
    query IntrospectionQuery {
      __schema {
        queryType {
          fields {
            name
            description
            args {
              name
              type { name kind }
            }
          }
        }
      }
    }
  `;
  
  try {
    const result = await graphql(query);
    const fields = result.__schema.queryType.fields;
    console.log('Available queries:');
    fields.slice(0, 30).forEach(f => {
      console.log(`  - ${f.name}`);
    });
    return fields;
  } catch (e) {
    console.error('Introspection failed:', e.message);
    return null;
  }
}

// Try to find the email health metrics query
async function findEmailHealthQuery() {
  // Common patterns for analytics queries
  const possibleQueries = [
    'email_health_metrics',
    'emailHealthMetrics',
    'analytics_email_health',
    'get_email_health_metrics',
    'email_account_stats',
    'mailbox_stats',
    'sender_stats'
  ];
  
  // Try introspection first
  const schema = await introspectSchema();
  if (schema) {
    const analyticsQueries = schema.filter(f => 
      f.name.toLowerCase().includes('email') ||
      f.name.toLowerCase().includes('health') ||
      f.name.toLowerCase().includes('mailbox') ||
      f.name.toLowerCase().includes('analytics')
    );
    console.log('\nPotential email/analytics queries:');
    analyticsQueries.forEach(q => {
      console.log(`  - ${q.name}: ${q.description || '(no desc)'}`);
      if (q.args?.length) {
        q.args.forEach(a => console.log(`      arg: ${a.name}`));
      }
    });
  }
}

// Test direct API call with date params
async function testDateQuery() {
  // SmartLead might use a different pattern - let's try the REST API
  const testUrl = 'https://server.smartlead.ai/api/v1/email-accounts/analytics';
  
  console.log('\nTesting REST API...');
  
  return new Promise((resolve) => {
    const options = {
      hostname: 'server.smartlead.ai',
      port: 443,
      path: '/api/v1/email-accounts?include_stats=true',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response preview:', body.slice(0, 500));
        resolve(body);
      });
    });

    req.on('error', (e) => {
      console.error('Request error:', e.message);
      resolve(null);
    });
    req.end();
  });
}

// Main
async function main() {
  console.log('SmartLead Email Health Metrics Scraper');
  console.log('======================================\n');
  
  console.log('Token loaded, length:', TOKEN.length);
  console.log('');
  
  // Try to find the right query
  await findEmailHealthQuery();
  
  // Test REST API
  await testDateQuery();
}

main().catch(console.error);
