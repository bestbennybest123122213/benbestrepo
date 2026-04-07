#!/usr/bin/env node
/**
 * API Documentation Generator
 * 
 * Generates documentation for all API endpoints
 */

const API_ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/stats',
    description: 'Pipeline statistics summary',
    response: {
      leadMetrics: 'Object with lead counts and rates',
      daily: 'Today vs yesterday comparison',
      weekly: 'This week vs last week comparison'
    }
  },
  {
    method: 'GET',
    path: '/api/positive-replies',
    description: 'All positive replies with enrichment',
    params: {
      category: 'Filter by category (optional)',
      limit: 'Max results (optional)'
    },
    response: {
      data: 'Array of lead objects'
    }
  },
  {
    method: 'GET',
    path: '/api/campaigns',
    description: 'Campaign performance data',
    response: {
      campaigns: 'Array of campaign objects',
      leadMetrics: 'Aggregate metrics'
    }
  },
  {
    method: 'GET',
    path: '/api/domain-health',
    description: 'Domain health and warmup status',
    response: {
      domainHealth: 'Array of domain objects',
      warmupStats: 'Overall warmup statistics'
    }
  },
  {
    method: 'POST',
    path: '/webhook/positive-reply',
    description: 'Webhook for new positive replies',
    body: {
      email: 'Lead email address',
      name: 'Lead name (optional)',
      company: 'Company name (optional)',
      category: 'Reply category'
    }
  },
  {
    method: 'POST',
    path: '/webhook/booking',
    description: 'Webhook for new bookings',
    body: {
      email: 'Lead email address',
      booking_date: 'Meeting date/time'
    }
  },
  {
    method: 'GET',
    path: '/health',
    description: 'Server health check',
    response: {
      status: 'ok or error',
      timestamp: 'ISO timestamp'
    }
  }
];

function generateDocs() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║   📚 GEX API Documentation                                               ║
║                                                                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   Base URL: http://localhost:3456                                        ║
║   Webhook URL: http://localhost:3457                                     ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  API_ENDPOINTS.forEach(endpoint => {
    console.log(`
────────────────────────────────────────────────────────────────────────────
${endpoint.method} ${endpoint.path}
────────────────────────────────────────────────────────────────────────────
${endpoint.description}
`);

    if (endpoint.params) {
      console.log('Parameters:');
      Object.entries(endpoint.params).forEach(([key, desc]) => {
        console.log(`  • ${key}: ${desc}`);
      });
      console.log('');
    }

    if (endpoint.body) {
      console.log('Request Body:');
      Object.entries(endpoint.body).forEach(([key, desc]) => {
        console.log(`  • ${key}: ${desc}`);
      });
      console.log('');
    }

    if (endpoint.response) {
      console.log('Response:');
      Object.entries(endpoint.response).forEach(([key, desc]) => {
        console.log(`  • ${key}: ${desc}`);
      });
    }
  });

  console.log(`
════════════════════════════════════════════════════════════════════════════

Examples:

# Get pipeline stats
curl http://localhost:3456/api/stats

# Get all positive replies
curl http://localhost:3456/api/positive-replies

# Get enterprise leads only (filter param)
curl "http://localhost:3456/api/positive-replies?category=Meeting%20Request"

# Webhook: New positive reply
curl -X POST http://localhost:3457/webhook/positive-reply \\
  -H "Content-Type: application/json" \\
  -d '{"email": "test@example.com", "name": "Test User", "category": "Interested"}'

════════════════════════════════════════════════════════════════════════════
`);
}

module.exports = { API_ENDPOINTS, generateDocs };

if (require.main === module) {
  generateDocs();
}
