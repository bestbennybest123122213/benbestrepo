const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function analyzeStaleLeads() {
  // Get leads in "Scheduling" status
  const { data: leads, error } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .eq('status', 'Scheduling')
    .order('conversation_date', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  const now = Date.now();
  const staleLeads = leads.filter(l => {
    if (!l.conversation_date) return false;
    const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
    return days > 14;
  }).map(l => {
    const days = Math.floor((now - new Date(l.conversation_date)) / (1000 * 60 * 60 * 24));
    return { ...l, days_stale: days };
  });

  // Prioritize by category and days stale
  const prioritized = staleLeads.sort((a, b) => {
    // Meeting Request > Interested > Booked > Info Request
    const categoryPriority = { 'Meeting Request': 1, 'Interested': 2, 'Booked': 3, 'Info Request': 4 };
    const aPri = categoryPriority[a.category] || 5;
    const bPri = categoryPriority[b.category] || 5;
    if (aPri !== bPri) return aPri - bPri;
    return b.days_stale - a.days_stale;
  });

  console.log(`\n📊 STALE LEADS ANALYSIS - ${new Date().toLocaleDateString()}`);
  console.log(`Total in Scheduling: ${leads.length}`);
  console.log(`Stale (>14 days): ${staleLeads.length}\n`);
  console.log('='.repeat(80));

  // Group by category
  const byCategory = {};
  prioritized.forEach(l => {
    if (!byCategory[l.category]) byCategory[l.category] = [];
    byCategory[l.category].push(l);
  });

  for (const [category, catLeads] of Object.entries(byCategory)) {
    console.log(`\n🔥 ${category.toUpperCase()} (${catLeads.length} stale leads)\n`);
    catLeads.slice(0, 8).forEach((l, i) => {
      console.log(`${i+1}. ${l.name || 'Unknown'} @ ${l.company || 'Unknown Company'}`);
      console.log(`   📧 ${l.email}`);
      console.log(`   ⏰ ${l.days_stale} days since reply (${new Date(l.conversation_date).toLocaleDateString()})`);
      if (l.notes) console.log(`   📝 ${l.notes.substring(0, 50)}...`);
      console.log('');
    });
    if (catLeads.length > 8) {
      console.log(`   ... and ${catLeads.length - 8} more\n`);
    }
  }

  // Top 20 for immediate action
  console.log('\n' + '='.repeat(80));
  console.log('\n🎯 TOP 20 PRIORITY FOLLOW-UPS:\n');
  
  const top20 = prioritized.slice(0, 20);
  top20.forEach((l, i) => {
    const urgency = l.days_stale > 30 ? '🔴' : l.days_stale > 21 ? '🟠' : '🟡';
    console.log(`${urgency} ${i+1}. [${l.category}] ${l.name || 'Unknown'} - ${l.company || 'Unknown'}`);
    console.log(`      ${l.email} | ${l.days_stale}d stale`);
  });

  // Company analysis - big names
  console.log('\n' + '='.repeat(80));
  console.log('\n🏢 NOTABLE COMPANIES IN STALE LIST:\n');
  
  const notableCompanies = prioritized.filter(l => {
    const company = (l.company || '').toLowerCase();
    return company.includes('unity') || company.includes('ign') || company.includes('replit') ||
           company.includes('udemy') || company.includes('doist') || company.includes('skillz') ||
           company.includes('jackpot') || company.includes('owlcat') || company.includes('virtus') ||
           company.includes('figure') || company.includes('complex') || company.includes('doublegood') ||
           company.includes('spothero') || company.includes('mindtrip') || company.includes('osmo');
  });
  
  notableCompanies.forEach(l => {
    console.log(`⭐ ${l.company}: ${l.name} (${l.email}) - ${l.days_stale}d stale`);
  });

  // Save report
  const fs = require('fs');
  const report = {
    generated: new Date().toISOString(),
    summary: {
      total_scheduling: leads.length,
      total_stale: staleLeads.length,
      by_category: Object.fromEntries(Object.entries(byCategory).map(([k, v]) => [k, v.length]))
    },
    top_20_priority: top20.map(l => ({
      name: l.name,
      email: l.email,
      company: l.company,
      category: l.category,
      days_stale: l.days_stale,
      conversation_date: l.conversation_date
    })),
    notable_companies: notableCompanies.map(l => ({
      name: l.name,
      email: l.email,
      company: l.company,
      days_stale: l.days_stale
    })),
    all_stale: prioritized.map(l => ({
      name: l.name,
      email: l.email,
      company: l.company,
      category: l.category,
      days_stale: l.days_stale
    }))
  };
  
  fs.writeFileSync('stale-leads-report.json', JSON.stringify(report, null, 2));
  console.log('\n\n✅ Full report saved to stale-leads-report.json');
}

analyzeStaleLeads();
