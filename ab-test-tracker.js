#!/usr/bin/env node
/**
 * A/B Test Tracker
 * 
 * Track and analyze A/B tests for:
 * - Email subject lines
 * - Email templates/copy
 * - Send times
 * - Campaign strategies
 * 
 * Features:
 * - Create and manage tests
 * - Track performance metrics
 * - Statistical significance calculation
 * - Winner detection
 * - Recommendations
 */

require('dotenv').config();
const fs = require('fs');
const { initSupabase } = require('./lib/supabase');
const { SmartLeadAPI } = require('./lib/smartlead-api');

const TESTS_FILE = 'ab-tests.json';

class ABTestTracker {
  constructor() {
    this.supabase = initSupabase();
    this.api = new SmartLeadAPI();
    this.tests = this.loadTests();
  }

  loadTests() {
    try {
      if (fs.existsSync(TESTS_FILE)) {
        return JSON.parse(fs.readFileSync(TESTS_FILE, 'utf8'));
      }
    } catch (e) {}
    return { tests: [], history: [] };
  }

  saveTests() {
    fs.writeFileSync(TESTS_FILE, JSON.stringify(this.tests, null, 2));
  }

  /**
   * Create a new A/B test
   */
  createTest(config) {
    const test = {
      id: Date.now().toString(),
      name: config.name,
      type: config.type, // 'subject', 'template', 'timing', 'strategy'
      status: 'active',
      createdAt: new Date().toISOString(),
      hypothesis: config.hypothesis || null,
      variants: config.variants.map((v, i) => ({
        id: String.fromCharCode(65 + i), // A, B, C...
        name: v.name,
        description: v.description,
        campaignIds: v.campaignIds || [],
        metrics: {
          sent: 0,
          opened: 0,
          replied: 0,
          positiveReplies: 0,
          booked: 0,
          bounced: 0
        }
      })),
      winner: null,
      confidence: 0,
      notes: []
    };

    this.tests.tests.push(test);
    this.saveTests();

    return test;
  }

  /**
   * Add a note to a test
   */
  addNote(testId, note) {
    const test = this.tests.tests.find(t => t.id === testId);
    if (!test) return false;

    test.notes.push({
      timestamp: new Date().toISOString(),
      text: note
    });
    this.saveTests();
    return true;
  }

  /**
   * Update test metrics from SmartLead
   */
  async updateTestMetrics(testId) {
    const test = this.tests.tests.find(t => t.id === testId);
    if (!test) {
      console.log(`Test not found: ${testId}`);
      return null;
    }

    console.log(`\n🔄 Updating metrics for test: ${test.name}\n`);

    for (const variant of test.variants) {
      let totalMetrics = {
        sent: 0, opened: 0, replied: 0, positiveReplies: 0, booked: 0, bounced: 0
      };

      for (const campaignId of variant.campaignIds) {
        try {
          const campaign = await this.api.getCampaign(campaignId);
          if (campaign) {
            totalMetrics.sent += parseInt(campaign.sent_count) || 0;
            totalMetrics.opened += parseInt(campaign.open_count) || 0;
            totalMetrics.replied += parseInt(campaign.reply_count) || 0;
            totalMetrics.bounced += parseInt(campaign.bounce_count) || 0;
            
            // Get positive replies
            const stats = campaign.campaign_lead_stats || {};
            totalMetrics.positiveReplies += parseInt(stats.interested) || 0;
            totalMetrics.booked += parseInt(stats.booked) || 0;
          }
        } catch (err) {
          console.log(`  ⚠️  Could not fetch campaign ${campaignId}`);
        }
        
        await this.sleep(200);
      }

      variant.metrics = totalMetrics;
      console.log(`  ✅ Variant ${variant.id} (${variant.name}): ${totalMetrics.sent} sent, ${totalMetrics.replied} replies`);
    }

    // Calculate significance and determine winner
    this.analyzeTest(test);
    test.updatedAt = new Date().toISOString();
    this.saveTests();

    return test;
  }

  /**
   * Analyze test results and determine winner
   */
  analyzeTest(test) {
    if (test.variants.length < 2) return;

    // Calculate conversion rates for each variant
    const rates = test.variants.map(v => {
      const sent = v.metrics.sent || 1;
      return {
        id: v.id,
        name: v.name,
        replyRate: (v.metrics.replied / sent) * 100,
        positiveRate: v.metrics.replied > 0 
          ? (v.metrics.positiveReplies / v.metrics.replied) * 100 
          : 0,
        bookingRate: (v.metrics.booked / sent) * 100,
        bounceRate: (v.metrics.bounced / sent) * 100,
        sent: v.metrics.sent
      };
    });

    // Sort by positive rate (or reply rate if no positives)
    const primaryMetric = rates.some(r => r.positiveRate > 0) ? 'positiveRate' : 'replyRate';
    rates.sort((a, b) => b[primaryMetric] - a[primaryMetric]);

    const best = rates[0];
    const second = rates[1];

    // Calculate statistical significance (simplified)
    // Using a basic z-test approximation
    const n1 = best.sent;
    const n2 = second.sent;
    const p1 = best[primaryMetric] / 100;
    const p2 = second[primaryMetric] / 100;
    const pooled = (p1 * n1 + p2 * n2) / (n1 + n2);
    const se = Math.sqrt(pooled * (1 - pooled) * (1/n1 + 1/n2));
    const z = se > 0 ? (p1 - p2) / se : 0;
    
    // Convert z-score to confidence
    const confidence = Math.min(99.9, Math.max(0, 
      z >= 2.58 ? 99 :
      z >= 1.96 ? 95 :
      z >= 1.64 ? 90 :
      z >= 1.28 ? 80 :
      z >= 0.84 ? 60 :
      50
    ));

    test.confidence = confidence;
    test.winner = confidence >= 90 ? best.id : null;
    test.analysis = {
      primaryMetric,
      rates,
      sampleSizes: { a: n1, b: n2 },
      zScore: z.toFixed(2)
    };
  }

  /**
   * Get all tests
   */
  getTests(status = null) {
    if (status) {
      return this.tests.tests.filter(t => t.status === status);
    }
    return this.tests.tests;
  }

  /**
   * End a test and record winner
   */
  endTest(testId, winnerId = null, notes = '') {
    const test = this.tests.tests.find(t => t.id === testId);
    if (!test) return false;

    test.status = 'completed';
    test.endedAt = new Date().toISOString();
    if (winnerId) test.winner = winnerId;
    if (notes) test.notes.push({ timestamp: new Date().toISOString(), text: notes });

    // Move to history
    this.tests.history.push(test);
    this.tests.tests = this.tests.tests.filter(t => t.id !== testId);
    this.saveTests();

    return test;
  }

  /**
   * Display test results
   */
  displayTest(test) {
    console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🧪 A/B TEST: ${test.name.slice(0, 50).padEnd(50)}            ║
╚══════════════════════════════════════════════════════════════════════════╝

  Type:       ${test.type}
  Status:     ${test.status}
  Created:    ${new Date(test.createdAt).toLocaleDateString()}
  ${test.hypothesis ? `Hypothesis: ${test.hypothesis}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 VARIANTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

    for (const variant of test.variants) {
      const m = variant.metrics;
      const replyRate = m.sent > 0 ? ((m.replied / m.sent) * 100).toFixed(2) : '0.00';
      const positiveRate = m.replied > 0 ? ((m.positiveReplies / m.replied) * 100).toFixed(1) : '0.0';
      const isWinner = test.winner === variant.id;

      console.log(`
  ${isWinner ? '🏆' : '📧'} VARIANT ${variant.id}: ${variant.name} ${isWinner ? '← WINNER' : ''}
  ${variant.description ? `     ${variant.description}` : ''}

     Sent:            ${m.sent.toLocaleString()}
     Opened:          ${m.opened.toLocaleString()} (${m.sent > 0 ? ((m.opened/m.sent)*100).toFixed(1) : 0}%)
     Replied:         ${m.replied.toLocaleString()} (${replyRate}%)
     Positive:        ${m.positiveReplies} (${positiveRate}% of replies)
     Booked:          ${m.booked}
     Bounced:         ${m.bounced} (${m.sent > 0 ? ((m.bounced/m.sent)*100).toFixed(2) : 0}%)
`);
    }

    if (test.analysis) {
      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Primary Metric:    ${test.analysis.primaryMetric}
  Confidence:        ${test.confidence}%
  Z-Score:           ${test.analysis.zScore}
  
  ${test.winner 
    ? `✅ Winner: Variant ${test.winner} with ${test.confidence}% confidence`
    : `⏳ No clear winner yet. Need more data or higher confidence.`
  }
`);
    }

    if (test.notes.length > 0) {
      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 NOTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
      test.notes.slice(-5).forEach(n => {
        console.log(`  [${new Date(n.timestamp).toLocaleDateString()}] ${n.text}`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
  }

  /**
   * List all tests
   */
  listTests() {
    const active = this.getTests('active');
    const completed = this.tests.history.slice(-10);

    console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🧪 A/B TEST TRACKER                                                     ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

    if (active.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔬 ACTIVE TESTS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      active.forEach(t => {
        const totalSent = t.variants.reduce((sum, v) => sum + v.metrics.sent, 0);
        const totalReplies = t.variants.reduce((sum, v) => sum + v.metrics.replied, 0);
        console.log(`  📧 ${t.name}`);
        console.log(`     ID: ${t.id} | Type: ${t.type}`);
        console.log(`     ${t.variants.length} variants | ${totalSent} sent | ${totalReplies} replies`);
        console.log(`     Confidence: ${t.confidence}% ${t.winner ? `| Winner: ${t.winner}` : ''}`);
        console.log('');
      });
    } else {
      console.log('  No active tests. Create one with:\n');
      console.log('  node ab-test-tracker.js create "Test Name" subject A,B\n');
    }

    if (completed.length > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📜 RECENT COMPLETED TESTS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      completed.forEach(t => {
        console.log(`  ${t.winner ? '🏆' : '📊'} ${t.name} → ${t.winner ? `Winner: ${t.winner}` : 'No winner'}`);
      });
      console.log('');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI
async function main() {
  const tracker = new ABTestTracker();
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  switch (command) {
    case 'list':
      tracker.listTests();
      break;

    case 'create':
      // node ab-test-tracker.js create "Subject Line Test" subject "Variant A,Variant B"
      const name = args[1];
      const type = args[2] || 'subject';
      const variantNames = (args[3] || 'A,B').split(',');

      if (!name) {
        console.log('Usage: node ab-test-tracker.js create "Test Name" <type> "Variant1,Variant2"');
        console.log('Types: subject, template, timing, strategy');
        return;
      }

      const test = tracker.createTest({
        name,
        type,
        variants: variantNames.map(n => ({
          name: n.trim(),
          description: '',
          campaignIds: []
        }))
      });

      console.log(`\n✅ Created test: ${test.name} (ID: ${test.id})`);
      console.log(`   Variants: ${test.variants.map(v => v.id + ' - ' + v.name).join(', ')}`);
      console.log(`\n   Next: Add campaign IDs with:`);
      console.log(`   node ab-test-tracker.js add-campaign ${test.id} A <campaign_id>\n`);
      break;

    case 'add-campaign':
      const testId = args[1];
      const variantId = args[2];
      const campaignId = args[3];

      if (!testId || !variantId || !campaignId) {
        console.log('Usage: node ab-test-tracker.js add-campaign <test_id> <variant_id> <campaign_id>');
        return;
      }

      const t = tracker.tests.tests.find(t => t.id === testId);
      if (!t) {
        console.log('Test not found');
        return;
      }

      const variant = t.variants.find(v => v.id === variantId);
      if (!variant) {
        console.log('Variant not found');
        return;
      }

      variant.campaignIds.push(campaignId);
      tracker.saveTests();
      console.log(`✅ Added campaign ${campaignId} to Variant ${variantId}`);
      break;

    case 'update':
      const updateTestId = args[1];
      if (!updateTestId) {
        // Update all active tests
        for (const t of tracker.getTests('active')) {
          await tracker.updateTestMetrics(t.id);
        }
      } else {
        await tracker.updateTestMetrics(updateTestId);
      }
      break;

    case 'show':
      const showTestId = args[1];
      if (!showTestId) {
        console.log('Usage: node ab-test-tracker.js show <test_id>');
        return;
      }
      const showTest = tracker.tests.tests.find(t => t.id === showTestId) ||
                       tracker.tests.history.find(t => t.id === showTestId);
      if (showTest) {
        tracker.displayTest(showTest);
      } else {
        console.log('Test not found');
      }
      break;

    case 'end':
      const endTestId = args[1];
      const winnerId = args[2];
      if (!endTestId) {
        console.log('Usage: node ab-test-tracker.js end <test_id> [winner_id]');
        return;
      }
      const ended = tracker.endTest(endTestId, winnerId);
      if (ended) {
        console.log(`\n✅ Test ended: ${ended.name}`);
        console.log(`   Winner: ${ended.winner || 'None declared'}`);
      } else {
        console.log('Test not found');
      }
      break;

    case 'note':
      const noteTestId = args[1];
      const noteText = args.slice(2).join(' ');
      if (!noteTestId || !noteText) {
        console.log('Usage: node ab-test-tracker.js note <test_id> <note text>');
        return;
      }
      if (tracker.addNote(noteTestId, noteText)) {
        console.log('✅ Note added');
      } else {
        console.log('Test not found');
      }
      break;

    default:
      console.log(`
A/B Test Tracker - Track email campaign experiments

Commands:
  list                    List all tests
  create <name> <type> <variants>
                          Create new test (type: subject/template/timing/strategy)
  add-campaign <test> <variant> <campaign_id>
                          Link a campaign to a test variant
  update [test_id]        Update metrics from SmartLead
  show <test_id>          Show detailed test results
  end <test_id> [winner]  End a test and declare winner
  note <test_id> <text>   Add a note to a test

Examples:
  node ab-test-tracker.js create "Subject Line Test" subject "Question,Statement"
  node ab-test-tracker.js add-campaign 123456 A campaign_001
  node ab-test-tracker.js update
  node ab-test-tracker.js show 123456
      `);
  }
}

module.exports = { ABTestTracker };

if (require.main === module) {
  main().catch(console.error);
}
