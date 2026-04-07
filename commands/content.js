#!/usr/bin/env node
/**
 * Content Calendar & Tracking
 * Track LinkedIn posts and maintain consistency.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/content-calendar.json');

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { posts: [], lastPost: null };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

async function main() {
  const args = process.argv.slice(2);
  const data = loadData();
  const subcommand = args[0];

  if (!subcommand || subcommand === 'status') {
    const days = data.lastPost ? daysSince(data.lastPost) : null;
    
    console.log('\n📅 CONTENT CALENDAR STATUS');
    console.log('═'.repeat(50));
    
    console.log(`\nTotal posts logged: ${data.posts?.length || 0}`);
    
    if (days === null) {
      console.log('Last post: Never');
      console.log('\n⚠️  Start posting on LinkedIn to track your streak.');
    } else if (days === 0) {
      console.log('Last post: Today ✓');
      console.log('\n🔥 Great job. Keep the momentum.');
    } else if (days <= 7) {
      console.log(`Last post: ${days} day(s) ago`);
      console.log('\n✓ On track for weekly posting.');
    } else {
      console.log(`Last post: ${days} day(s) ago`);
      console.log('\n⚠️  Time to post. Consistency builds inbound.');
    }
    
    console.log('\nTarget: 1 post per week (minimum)');
    console.log('Best days: Tuesday-Thursday, 8-10 AM');
    
    console.log('\nCommands:');
    console.log('  gex content posted    - Log a new post');
    console.log('  gex content ideas     - Get post ideas');
    console.log('  gex content history   - View post history');
    console.log('  gex content templates - Ready-to-post templates');
    return;
  }

  if (subcommand === 'posted' || subcommand === 'log') {
    const topic = args.slice(1).join(' ') || 'LinkedIn post';
    const date = new Date().toISOString().split('T')[0];
    
    data.posts = data.posts || [];
    data.posts.push({ date, topic });
    data.lastPost = date;
    saveData(data);
    
    console.log(`✅ Logged post: "${topic}" on ${date}`);
    console.log(`Total posts: ${data.posts.length}`);
    console.log('\nKeep it up. Consistency drives inbound.');
    return;
  }

  if (subcommand === 'ideas') {
    console.log('\n💡 CONTENT IDEAS');
    console.log('═'.repeat(50));
    console.log(`
CASE STUDIES (High Impact):
• Whiteout Survival: 48M views, 100K users (gaming angle)
• Gauth AI: 15M views, 50K downloads (education angle)

INDUSTRY OBSERVATIONS:
• Why creator marketing is replacing traditional ads
• The death of interruptive advertising
• Gen Z doesn't trust ads, but trusts creators

BEHIND THE SCENES:
• How we negotiate creator deals
• What brands get wrong about influencer marketing
• The real cost of a bad campaign

HOT TAKES:
• Most "influencer" marketing agencies don't understand YouTube
• Why CPM is a vanity metric for creator campaigns
• The brands winning on YouTube aren't the ones spending the most

QUICK TIPS:
• One thing that changed how I evaluate creators
• The question I ask before every campaign
• Why story integrations beat ad reads 10x

RESULTS (when you have them):
• Just wrapped a campaign that hit [X]M views
• Real numbers from our latest [vertical] campaign

See full templates: drafts/LINKEDIN-POST-TEMPLATES.md
`);
    return;
  }

  if (subcommand === 'history') {
    console.log('\n📋 POST HISTORY');
    console.log('═'.repeat(50));
    
    if (!data.posts || data.posts.length === 0) {
      console.log('\nNo posts logged yet.');
      console.log('Use: gex content posted "topic" to log your posts.');
      return;
    }
    
    const recent = data.posts.slice(-10).reverse();
    recent.forEach(p => {
      console.log(`  ${p.date} - ${p.topic}`);
    });
    
    console.log(`\nTotal: ${data.posts.length} posts`);
    return;
  }

  if (subcommand === 'templates') {
    console.log('\n📝 QUICK TEMPLATES');
    console.log('═'.repeat(50));
    console.log(`
CASE STUDY (copy-paste ready):
---
48 million views. 100,000+ new users. One YouTube integration.

Here's what happened when Whiteout Survival partnered with a 10M subscriber creator:

The challenge: Reach Gen Z gamers without burning money on mobile acquisition.

The approach: Story-driven integration that fit the creator's style.

The results:
→ 48M+ views
→ 100K+ new users
→ CPI below industry average

Why it worked:
1. Audience alignment
2. Authentic integration
3. Trust transfer

One good integration > 100 forgettable ads.

DM me if you want similar results.
---

See more: drafts/LINKEDIN-POST-TEMPLATES.md
`);
    return;
  }
}

main().catch(console.error);
