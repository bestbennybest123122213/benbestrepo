#!/usr/bin/env node
/**
 * SmartLead API Scraper using API Key - THE SIMPLE APPROACH
 * 
 * Uses the same API key that the server uses.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';
const DATA_DIR = path.join(__dirname, 'data');

const log = msg => console.log(`[${new Date().toISOString()}] ${msg}`);

// Date range configurations
function getDateRanges() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const formatDate = d => d.toISOString().split('T')[0];
  
  const ranges = [
    { key: 'yesterday', days: 1 },
    { key: 'last_3_days', days: 3 },
    { key: 'last_7_days', days: 7 },
    { key: 'last_14_days', days: 14 },
    { key: 'last_30_days', days: 30 },
    { key: 'last_60_days', days: 60 },
    { key: 'last_90_days', days: 90 },
    { key: 'last_120_days', days: 120 }
  ];
  
  return ranges.map(r => {
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(endDate.getDate() - r.days + 1);
    
    return {
      key: r.key,
      days: r.days,
      start_date: formatDate(startDate),
      end_date: formatDate(endDate),
      label: `Last ${r.days} Days`
    };
  });
}

async function apiRequest(endpoint) {
  const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } catch (e) {
    log(`API error: ${e.message}`);
    return null;
  }
}

async function main() {
  if (!API_KEY) {
    log('ERROR: SMARTLEAD_API_KEY not set');
    return;
  }
  
  log('Starting API key-based scrape...');
  log(`API Key: ${API_KEY.substring(0, 10)}...`);
  
  const ranges = getDateRanges();
  const results = {};
  
  for (const range of ranges) {
    log(`Fetching ${range.label} (${range.start_date} to ${range.end_date})...`);
    
    // Try overall-stats-v2 first
    let data = await apiRequest(`/analytics/overall-stats-v2?start_date=${range.start_date}&end_date=${range.end_date}`);
    
    if (data?.success && data?.data?.overall_stats) {
      const stats = data.data.overall_stats;
      
      // Get positive from category-wise-response
      let positive = 0;
      const catData = await apiRequest(`/analytics/lead/category-wise-response?start_date=${range.start_date}&end_date=${range.end_date}`);
      if (catData?.data?.category_wise_stats) {
        positive = catData.data.category_wise_stats.reduce((sum, cat) => {
          if (cat.lead_category === 'Interested' || cat.lead_category === 'Meeting Request' || 
              cat.lead_category === 'Meeting Booked' || cat.lead_category === 'Information Request' ||
              cat.lead_category === 'Out Of Office') {
            return sum + (parseInt(cat.lead_category_count) || 0);
          }
          return sum;
        }, 0);
      }
      
      results[range.key] = {
        period: `${range.start_date} - ${range.end_date}`,
        days: range.days,
        sent: stats.sent || 0,
        opened: stats.opened || 0,
        replied: stats.replied || 0,
        positive: positive,
        bounced: stats.bounced || 0,
        source: 'overall-stats-v2 + category-wise'
      };
      log(`  ✓ Sent: ${results[range.key].sent}, Replied: ${results[range.key].replied}, Positive: ${results[range.key].positive}`);
    } else {
      // Fallback to day-wise
      log(`  overall-stats-v2 failed, trying day-wise...`);
      data = await apiRequest(`/analytics/day-wise-overall-stats?start_date=${range.start_date}&end_date=${range.end_date}`);
      
      if (data?.data?.day_wise_stats || data?.day_wise_stats) {
        const days = data.data?.day_wise_stats || data.day_wise_stats || [];
        const totals = days.reduce((acc, day) => {
          const metrics = day.email_engagement_metrics || {};
          acc.sent += parseInt(metrics.sent) || 0;
          acc.opened += parseInt(metrics.opened) || 0;
          acc.replied += parseInt(metrics.replied) || 0;
          acc.bounced += parseInt(metrics.bounced) || 0;
          return acc;
        }, { sent: 0, opened: 0, replied: 0, bounced: 0 });
        
        results[range.key] = {
          period: `${range.start_date} - ${range.end_date}`,
          days: range.days,
          ...totals,
          positive: 0, // day-wise doesn't have positive
          source: 'day-wise-overall-stats'
        };
        log(`  ✓ (day-wise) Sent: ${totals.sent}, Replied: ${totals.replied}`);
      } else {
        log(`  ✗ No data available`);
      }
    }
    
    // Small delay for rate limiting
    await new Promise(r => setTimeout(r, 300));
  }
  
  // Save results
  const timestamp = new Date().toISOString();
  const dateStr = new Date().toISOString().split('T')[0];
  
  const output = {
    scraped_at: timestamp,
    source: 'SmartLead API v1 (API Key auth)',
    method: 'Direct API with API key',
    ranges: results
  };
  
  const outputPath = path.join(DATA_DIR, `api-key-scrape-${dateStr}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  log(`\nSaved to ${outputPath}`);
  
  // Print summary
  log('\n=== Summary ===');
  for (const [key, data] of Object.entries(results)) {
    log(`${key}: ${data.sent} sent, ${data.replied} replied, ${data.positive} positive (via ${data.source})`);
  }
  
  log('\nDone');
}

main().catch(e => console.error(e));
