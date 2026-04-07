require('dotenv').config();
const { initSupabase } = require('./lib/supabase');

async function checkMeetings() {
  const supabase = initSupabase();
  if (!supabase) {
    console.log('❌ Failed to initialize Supabase');
    return;
  }

  const { data: leads } = await supabase
    .from('imann_positive_replies')
    .select('name, company, email, meeting_date, status')
    .not('meeting_date', 'is', null)
    .order('meeting_date', { ascending: true });

  if (!leads) {
    console.log('❌ No leads found');
    return;
  }

  const now = new Date();
  const upcoming = leads.filter(l => new Date(l.meeting_date) >= now);
  const past = leads.filter(l => new Date(l.meeting_date) < now);
  
  console.log(`\n📅 MEETINGS OVERVIEW`);
  console.log(`Total with meeting dates: ${leads.length}`);
  console.log(`Upcoming: ${upcoming.length}`);
  console.log(`Past: ${past.length}`);
  
  console.log('\n📆 UPCOMING MEETINGS:');
  upcoming.slice(0, 10).forEach(l => {
    const date = new Date(l.meeting_date);
    console.log(`• ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${l.name} @ ${l.company}`);
  });
  
  console.log('\n📜 RECENT PAST MEETINGS:');
  past.slice(-5).reverse().forEach(l => {
    const date = new Date(l.meeting_date);
    console.log(`• ${date.toLocaleDateString()} - ${l.name} @ ${l.company} [${l.status}]`);
  });
}

checkMeetings();
