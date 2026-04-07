/**
 * Emergency Mode - Ultra-minimal single action
 * Shows ONE thing to do with ZERO noise
 * 
 * Usage: gex emergency
 * 
 * Built: Feb 9, 2026 22:01
 */

const { createClient } = require('@supabase/supabase-js');

// Priority logic: Booked > Meeting Request > Hot Reply
// Only show THE most important action

async function getEmergencyAction(supabase) {
  // First: Any booked meetings that need closing?
  // status = 'Booked' means meeting is scheduled
  const { data: booked } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .eq('status', 'Booked')
    .order('created_at', { ascending: true })
    .limit(1);

  if (booked && booked.length > 0) {
    return {
      type: 'BOOKED_MEETING',
      urgency: 'CRITICAL',
      lead: booked[0],
      action: 'Take this call and close the deal',
      timeEstimate: '30 min'
    };
  }

  // Second: Leads in scheduling limbo - need to book
  // status = 'Scheduling' means they want a meeting but not booked yet
  const { data: scheduling } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .eq('status', 'Scheduling')
    .order('created_at', { ascending: true })
    .limit(1);

  if (scheduling && scheduling.length > 0) {
    return {
      type: 'NEEDS_BOOKING',
      urgency: 'HIGH',
      lead: scheduling[0],
      action: 'Send Calendly link to book this meeting',
      timeEstimate: '2 min'
    };
  }

  // Third: Not booked leads - need follow-up
  const { data: notBooked } = await supabase
    .from('imann_positive_replies')
    .select('*')
    .eq('status', 'Not booked')
    .order('created_at', { ascending: true })
    .limit(1);

  if (notBooked && notBooked.length > 0) {
    return {
      type: 'NEEDS_FOLLOWUP',
      urgency: 'MEDIUM',
      lead: notBooked[0],
      action: 'Follow up to re-engage this lead',
      timeEstimate: '5 min'
    };
  }

  return null;
}

function generateEmail(action) {
  const lead = action.lead;
  // Extract first name from full name or email
  const fullName = lead.name || '';
  const firstName = fullName.split(' ')[0] || lead.email.split('@')[0];
  const company = lead.company || lead.email.split('@')[1].split('.')[0];

  if (action.type === 'BOOKED_MEETING') {
    return {
      to: lead.email,
      subject: `Looking forward to our call!`,
      body: `Hi ${firstName},

Just wanted to confirm our upcoming call and share a quick agenda:

1. Learn about ${company}'s goals (5 min)
2. IMANN's content style + audience fit (5 min)
3. Case studies & results (5 min)
4. Pricing & next steps (5 min)

See you soon!

Best,
Jan`
    };
  }

  if (action.type === 'MEETING_REQUEST') {
    return {
      to: lead.email,
      subject: `Re: Let's connect - here's my calendar`,
      body: `Hi ${firstName},

Thanks for your interest! Here's my calendar to book a quick call:

[YOUR CALENDLY LINK]

Looking forward to chatting about how IMANN can help ${company}.

Best,
Jan`
    };
  }

  if (action.type === 'INTERESTED') {
    return {
      to: lead.email,
      subject: `Quick question about ${company}`,
      body: `Hi ${firstName},

Following up on your interest - would love to learn more about what ${company} is looking to achieve.

Do you have 15 minutes this week for a quick call?

Best,
Jan`
    };
  }

  return null;
}

async function run() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Supabase not configured');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const action = await getEmergencyAction(supabase);

  if (!action) {
    console.log('\n✅ No emergency actions. Pipeline is clear.\n');
    return;
  }

  const email = generateEmail(action);
  const lead = action.lead;

  // Ultra-minimal output
  console.log('\n' + '═'.repeat(60));
  console.log('🚨 EMERGENCY MODE');
  console.log('═'.repeat(60));
  
  console.log(`\n${action.urgency} | ${action.type.replace('_', ' ')}`);
  console.log(`⏱️  ${action.timeEstimate}\n`);

  console.log('─'.repeat(60));
  console.log(`📧 ${lead.name || 'Lead'} @ ${lead.company || 'Unknown'}`);
  console.log(`   ${lead.email}`);
  if (lead.meeting_date) {
    const meetingDate = new Date(lead.meeting_date);
    console.log(`   📅 Meeting: ${meetingDate.toLocaleDateString()} ${meetingDate.toLocaleTimeString()}`);
  }
  console.log('─'.repeat(60));

  console.log(`\n🎯 ACTION: ${action.action}\n`);

  if (email) {
    console.log('─'.repeat(60));
    console.log('📝 READY-TO-SEND EMAIL');
    console.log('─'.repeat(60));
    console.log(`To: ${email.to}`);
    console.log(`Subject: ${email.subject}`);
    console.log('─'.repeat(60));
    console.log(email.body);
    console.log('─'.repeat(60));
  }

  console.log('\n💡 Copy the email above. Send it. Done.\n');
}

module.exports = { run, getEmergencyAction, generateEmail };

if (require.main === module) {
  require('dotenv').config();
  run().catch(console.error);
}
