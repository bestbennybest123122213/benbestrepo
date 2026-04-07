#!/usr/bin/env node
/**
 * Conversion Calculator
 * 
 * Calculate what you need to hit your targets:
 * - Leads needed
 * - Response rates required
 * - Revenue projections
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function calculateConversions() {
  const client = initSupabase();
  if (!client) throw new Error('Database not initialized');

  const { data: leads } = await client
    .from('positive_replies')
    .select('*');

  if (!leads) throw new Error('No leads found');

  // Current metrics
  const total = leads.length;
  const booked = leads.filter(l => l.reply_category === 'Booked').length;
  const meetings = leads.filter(l => l.reply_category === 'Meeting Request').length;
  const currentBookingRate = (booked / total * 100);
  const meetingToBookRate = booked > 0 && meetings > 0 
    ? ((booked / (booked + meetings)) * 100) 
    : 30; // Default assumption

  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║  🧮 CONVERSION CALCULATOR                                                ║
║  What do you need to hit your targets?                                   ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CURRENT METRICS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`  Total positive replies:     ${total}`);
  console.log(`  Booked:                     ${booked} (${currentBookingRate.toFixed(1)}%)`);
  console.log(`  Meeting requests:           ${meetings}`);
  console.log(`  Meeting-to-book rate:       ${meetingToBookRate.toFixed(1)}%`);

  // Projections
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 PROJECTIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // If we convert all meeting requests
  const potentialBookings = Math.floor(meetings * (meetingToBookRate / 100));
  console.log(`  If you book ${(meetingToBookRate).toFixed(0)}% of meeting requests:`);
  console.log(`  → ${potentialBookings} more bookings possible`);
  console.log(`  → Total would be: ${booked + potentialBookings} bookings`);

  // Target scenarios
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 WHAT YOU NEED TO HIT TARGETS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const targets = [30, 40, 50, 60];
  
  targets.forEach(target => {
    const needed = target - booked;
    if (needed <= 0) {
      console.log(`  🎉 ${target} bookings: Already achieved! (${booked})`);
    } else {
      const meetingsNeeded = Math.ceil(needed / (meetingToBookRate / 100));
      console.log(`  🎯 ${target} bookings: Need ${needed} more`);
      console.log(`     → Book ${meetingsNeeded} of your ${meetings} meeting requests`);
      console.log(`     → That's ${(needed / meetings * 100).toFixed(0)}% conversion needed`);
    }
    console.log('');
  });

  // Revenue projection (assuming $500 per booking)
  const revenuePerBooking = 500;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 REVENUE PROJECTION (assuming $500/booking)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`  Current revenue potential:  $${(booked * revenuePerBooking).toLocaleString()}`);
  console.log(`  With all meetings booked:   $${((booked + potentialBookings) * revenuePerBooking).toLocaleString()}`);
  console.log(`  Upside:                     $${(potentialBookings * revenuePerBooking).toLocaleString()}`);

  // Action items
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 TODAY\'S FOCUS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`  1. Book ${Math.min(5, meetings)} meeting requests today`);
  console.log(`  2. Expected revenue: $${(Math.min(5, meetings) * revenuePerBooking * (meetingToBookRate / 100)).toFixed(0)}`);
  console.log(`  3. Use: node gex.js calendar`);

  console.log('\n═══════════════════════════════════════════════════════════════════════════\n');
}

module.exports = { calculateConversions };

if (require.main === module) {
  calculateConversions().catch(console.error);
}
