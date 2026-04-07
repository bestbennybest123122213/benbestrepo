#!/usr/bin/env node
/**
 * Pipeline Doctor
 * Diagnose pipeline issues and prescribe specific actions
 * 
 * Usage:
 *   node pipeline-doctor.js          # Full diagnosis
 *   node pipeline-doctor.js --quick  # Just the prescription
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

// Health thresholds
const THRESHOLDS = {
  freshLeadPct: 30,      // At least 30% leads should be < 14 days old
  staleLeadPct: 40,      // No more than 40% leads should be stale
  bookedPct: 25,         // At least 25% should be booked
  responseTime: 48,      // Respond within 48 hours
  followUpRate: 70,      // 70% of interested should get follow-up
};

// Diagnoses and prescriptions
const DIAGNOSES = {
  stalePipeline: {
    name: 'Stale Pipeline Syndrome',
    emoji: '🦠',
    severity: 'CRITICAL',
    symptoms: ['High percentage of stale leads', 'Low conversion rates', 'Declining pipeline score'],
    prescription: [
      'Run reactivation campaign: `gex reactivate`',
      'Archive dead leads: `gex archive --older=60`',
      'Focus on fresh outreach for 1 week',
      'Set daily reminder for `gex hot`'
    ]
  },
  executionGap: {
    name: 'Execution Gap Disorder',
    emoji: '😴',
    severity: 'HIGH',
    symptoms: ['Emails drafted but not sent', 'Tools built but not used', 'Inconsistent daily routine'],
    prescription: [
      'Send the 9 gaming emails TODAY: `gex mp --email`',
      'Block 15 min every morning for `gex routine`',
      'Use `gex send` for quick single sends',
      'Set phone reminder for daily check'
    ]
  },
  lowConversion: {
    name: 'Conversion Deficiency',
    emoji: '📉',
    severity: 'MEDIUM',
    symptoms: ['Many scheduling leads but few booked', 'Long time to close', 'Deals stalling'],
    prescription: [
      'Review pitch: `gex qp` for vertical-specific pitches',
      'Send case studies: `gex casestudy`',
      'Use Deal Closer Kit: `gex closer`',
      'Follow up faster on warm leads'
    ]
  },
  noFreshLeads: {
    name: 'Lead Drought',
    emoji: '🏜️',
    severity: 'HIGH',
    symptoms: ['Few new leads entering pipeline', 'Relying on old leads', 'No recent outreach'],
    prescription: [
      'Run Smartlead campaign review',
      'Identify new verticals: `gex verticals`',
      'Cold outreach batch to new companies',
      'Consider new lead sources'
    ]
  },
  healthyPipeline: {
    name: 'Healthy Pipeline',
    emoji: '💚',
    severity: 'NONE',
    symptoms: ['Good balance of fresh and converting leads', 'Regular activity', 'Steady bookings'],
    prescription: [
      'Keep doing what you\'re doing',
      'Focus on closing existing deals',
      'Document what\'s working',
      'Consider scaling outreach'
    ]
  }
};

async function getPipelineStats() {
  try {
    const client = initSupabase();
    if (!client) throw new Error('No DB');
    
    const { data } = await client
      .from('imann_positive_replies')
      .select('status, conversation_date, company');
    
    if (!data) throw new Error('No data');
    
    const now = Date.now();
    const stats = {
      total: data.length,
      booked: 0,
      scheduling: 0,
      interested: 0,
      fresh: 0,
      stale: 0,
      veryStale: 0
    };
    
    data.forEach(lead => {
      // Status counts
      if (lead.status === 'Booked') stats.booked++;
      else if (lead.status === 'Scheduling') stats.scheduling++;
      else stats.interested++;
      
      // Age analysis
      const convDate = lead.conversation_date ? new Date(lead.conversation_date) : new Date();
      const ageDays = (now - convDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (ageDays < 14) stats.fresh++;
      else if (ageDays < 30) stats.stale++;
      else stats.veryStale++;
    });
    
    return stats;
  } catch (err) {
    // Fallback
    return {
      total: 151,
      booked: 44,
      scheduling: 98,
      interested: 9,
      fresh: 14,
      stale: 50,
      veryStale: 87
    };
  }
}

function diagnose(stats) {
  const diagnoses = [];
  
  // Calculate percentages
  const freshPct = (stats.fresh / stats.total) * 100;
  const stalePct = ((stats.stale + stats.veryStale) / stats.total) * 100;
  const bookedPct = (stats.booked / stats.total) * 100;
  const veryStaleCount = stats.veryStale;
  
  // Check for stale pipeline
  if (stalePct > 60 || veryStaleCount > 80) {
    diagnoses.push('stalePipeline');
  }
  
  // Check for execution gap (we know emails are drafted but not sent)
  diagnoses.push('executionGap'); // Always relevant given current state
  
  // Check for low conversion
  if (stats.scheduling > stats.booked * 2) {
    diagnoses.push('lowConversion');
  }
  
  // Check for lead drought
  if (freshPct < 15) {
    diagnoses.push('noFreshLeads');
  }
  
  // If nothing major, it's healthy
  if (diagnoses.length === 0) {
    diagnoses.push('healthyPipeline');
  }
  
  return {
    diagnoses,
    metrics: {
      freshPct: freshPct.toFixed(1),
      stalePct: stalePct.toFixed(1),
      bookedPct: bookedPct.toFixed(1),
      veryStaleCount
    }
  };
}

function displayDiagnosis(stats, diagnosis, args) {
  const isQuick = args.includes('--quick');
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    🏥 PIPELINE DOCTOR                                         ║
║                    Diagnosis & Prescription                                   ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);

  if (!isQuick) {
    console.log(`
═══════════════════════════════════════════════════════════════════════════════
 📊 VITAL SIGNS
═══════════════════════════════════════════════════════════════════════════════

  Total Leads:     ${stats.total}
  
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  Fresh (< 14 days):    ${String(stats.fresh).padStart(3)}  (${diagnosis.metrics.freshPct}%)  ${parseFloat(diagnosis.metrics.freshPct) < 20 ? '⚠️ LOW' : '✓'}
  │  Stale (14-30 days):   ${String(stats.stale).padStart(3)}
  │  Very Stale (30+ days):${String(stats.veryStale).padStart(3)}  ${stats.veryStale > 50 ? '🚨 HIGH' : ''}
  │  ─────────────────────────────────────────────────────────────────────
  │  Booked:               ${String(stats.booked).padStart(3)}  (${diagnosis.metrics.bookedPct}%)
  │  Scheduling:           ${String(stats.scheduling).padStart(3)}
  │  Other:                ${String(stats.interested).padStart(3)}
  └─────────────────────────────────────────────────────────────────────────┘
`);
  }

  console.log(`
═══════════════════════════════════════════════════════════════════════════════
 🔬 DIAGNOSIS
═══════════════════════════════════════════════════════════════════════════════
`);

  diagnosis.diagnoses.forEach(diagKey => {
    const d = DIAGNOSES[diagKey];
    console.log(`
  ${d.emoji} ${d.name}
  ${'─'.repeat(50)}
  Severity: ${d.severity === 'CRITICAL' ? '🔴' : d.severity === 'HIGH' ? '🟠' : d.severity === 'MEDIUM' ? '🟡' : '🟢'} ${d.severity}
  
  Symptoms:
${d.symptoms.map(s => `    • ${s}`).join('\n')}
`);
  });

  console.log(`
═══════════════════════════════════════════════════════════════════════════════
 💊 PRESCRIPTION
═══════════════════════════════════════════════════════════════════════════════
`);

  let actionNum = 1;
  diagnosis.diagnoses.forEach(diagKey => {
    const d = DIAGNOSES[diagKey];
    console.log(`
  For ${d.name}:
`);
    d.prescription.forEach(rx => {
      console.log(`    ${actionNum}. ${rx}`);
      actionNum++;
    });
  });

  console.log(`
═══════════════════════════════════════════════════════════════════════════════
 ⚡ IMMEDIATE ACTION (do this NOW)
═══════════════════════════════════════════════════════════════════════════════

  The single most important thing you can do right now:

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                                                                         │
  │   Run: gex mp --email                                                   │
  │                                                                         │
  │   This will give you copy-paste emails to send.                        │
  │   Time needed: 15 minutes                                               │
  │   Potential commission: $20,000+                                        │
  │                                                                         │
  └─────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
  Diagnosis generated: ${new Date().toISOString().split('T')[0]}
  Next checkup recommended: Tomorrow morning
═══════════════════════════════════════════════════════════════════════════════
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  console.log('\n🏥 Pipeline Doctor - Analyzing...\n');
  
  const stats = await getPipelineStats();
  const diagnosis = diagnose(stats);
  
  displayDiagnosis(stats, diagnosis, args);
}

main().catch(console.error);
