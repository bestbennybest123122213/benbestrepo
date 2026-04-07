#!/usr/bin/env node
/**
 * Quick Send Tool
 * 
 * Generates ready-to-click mailto: links for drafted emails.
 * One click opens your email client with everything pre-filled.
 * 
 * Usage:
 *   node quick-send.js                # Show all ready emails
 *   node quick-send.js --html         # Generate HTML page with buttons
 *   node quick-send.js --copy <n>     # Copy mailto link to clipboard
 *   node quick-send.js --gaming       # Just gaming leads
 */

require('dotenv').config();
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const HTML = args.includes('--html');
const GAMING = args.includes('--gaming');
const COPY = args.includes('--copy');
const MARK = args.includes('--mark') || args.includes('--sent');
const STATUS = args.includes('--status');
const RESET = args.includes('--reset');
const HELP = args.includes('--help') || args.includes('-h');

const SENT_FILE = path.join(__dirname, 'data', 'sent-emails.json');

// ANSI colors
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Load/save sent tracking
function loadSentData() {
  try {
    if (fs.existsSync(SENT_FILE)) {
      return JSON.parse(fs.readFileSync(SENT_FILE, 'utf8'));
    }
  } catch (e) {}
  return { sent: {}, history: [] };
}

function saveSentData(data) {
  const dir = path.dirname(SENT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SENT_FILE, JSON.stringify(data, null, 2));
}

function markAsSent(email) {
  const data = loadSentData();
  data.sent[email] = new Date().toISOString();
  data.history.push({ email, sentAt: data.sent[email] });
  saveSentData(data);
}

function isSent(email) {
  const data = loadSentData();
  return !!data.sent[email];
}

if (HELP) {
  console.log(`
${c.bold}Quick Send Tool${c.reset}
Generate clickable mailto: links for instant email sending.

${c.cyan}Usage:${c.reset}
  gex send                    Show ready emails with links
  gex send --html             Generate HTML page with send buttons
  gex send --copy 1           Copy mailto link for email #1
  gex send --mark 1           Mark email #1 as sent
  gex send --status           Show sent vs pending
  gex send --reset            Reset sent tracking

${c.cyan}Features:${c.reset}
  • One-click opens email client with everything pre-filled
  • Subject and body already formatted
  • Track which emails are sent vs pending
  • Avoid duplicate sends
`);
  process.exit(0);
}

// Hot leads - respond first!
const hotLeads = [
  {
    name: 'Nick Depalo',
    company: 'Unity',
    email: 'nick.depalo@unity.com',
    subject: 'RE: Meeting Request - ItssIMANNN Partnership',
    body: `Hi Nick,

Apologies for the delay - following up on your meeting request.

ItssIMANNN would be perfect for Unity. His gaming-focused audience (10M+ subs) loves seeing how games are made. A "behind the scenes with Unity" angle could be really compelling.

Are you still available for a quick call this week? Happy to walk through some creative approaches.

Best,
Jan`,
    days: 14,
    priority: 0,
    hot: true
  },
  {
    name: 'Sungkwan Kim',
    company: 'Navercorp',
    email: 'sungkwan.kim@navercorp.com',
    subject: 'RE: Meeting Request - ItssIMANNN',
    body: `Hi Sungkwan,

Following up on your meeting request - apologies for the delay.

ItssIMANNN has 10M+ subscribers and drives exceptional engagement. Our last campaign hit 48M views. Would love to discuss what Naver is looking for.

Do you have 15 minutes this week for a quick call?

Best,
Jan`,
    days: 11,
    priority: 0,
    hot: true
  },
  {
    name: 'Christina Hamilton',
    company: 'Udemy',
    email: 'christina.hamilton@udemy.com',
    subject: 'RE: Meeting Request - ItssIMANNN Partnership',
    body: `Hi Christina,

Following up on your meeting request - apologies for the delay.

ItssIMANNN would be a great fit for Udemy. His audience is young and eager to learn - perfect for educational content. His last campaign drove 48M views.

Are you still available for a quick call? Would love to discuss what Udemy is looking for.

Best,
Jan`,
    days: 17,
    priority: 0,
    hot: true
  },
  {
    name: 'Replit Team',
    company: 'Replit',
    email: 'partnerships@replit.com',
    subject: 'RE: Meeting Request - ItssIMANNN x Replit',
    body: `Hi there,

Following up on your meeting request about ItssIMANNN.

Replit would be amazing for his audience - young creators interested in coding and building. His storytelling style could make coding look exciting and accessible. Last campaign: 48M views, 100K+ actions.

Would love to discuss creative approaches. Free for a quick call this week?

Best,
Jan`,
    days: 22,
    priority: 0,
    hot: true
  },
  {
    name: 'Agnes Ahlquist',
    company: 'Natural Cycles',
    email: 'partnerships@naturalcycles.com',
    subject: 'Re: Partnership with ItssIMANNN',
    body: `Hi Agnes,

Happy to share more about ItssIMANNN.

He has 10M+ subscribers and creates story-driven content that really resonates. Our last campaign (Whiteout Survival) drove 48M views and 100K+ new users.

Would a 15-minute call work to discuss? I can walk you through some examples that would be relevant for Natural Cycles.

Best,
Jan`,
    days: 2,
    priority: 0,
    hot: true
  },
  {
    name: 'Sadia Azmal',
    company: 'Agilebits (1Password)',
    email: 'sadia.azmal@agilebits.com',
    subject: 'Re: ItssIMANNN Partnership Info',
    body: `Hi Sadia,

Thanks for your interest in ItssIMANNN.

Quick overview: 10M+ subscribers, story-driven content that drives high engagement. Our Whiteout Survival campaign hit 48M views and drove 100K+ downloads.

1Password would be a great fit - security awareness content for a young audience. Would love to discuss what you're looking for. Free for a quick call this week?

Best,
Jan`,
    days: 2,
    priority: 0,
    hot: true
  }
];

// Gaming leads from drafts
const gamingLeads = [
  {
    name: 'Marina Andersson',
    company: 'Stillfront',
    email: 'marina.andersson@stillfront.com',
    subject: 'RE: Partnership with ItssIMANNN',
    body: `Hi Marina,

Following up on your interest - would love to discuss how we can work together.

ItssIMANNN has driven exceptional results for gaming brands. His last campaign (Whiteout Survival) hit 48M views and 100K+ new users. His storytelling format works incredibly well for strategy and mobile games.

Do you have 15 minutes this week for a quick call?

Best,
Jan`,
    days: 3,
    priority: 1
  },
  {
    name: 'Tushar Jain',
    company: 'Dream11',
    email: 'tushar.jain@dream11.com',
    subject: 'RE: Partnership with ItssIMANNN',
    body: `Hi Tushar,

Apologies for the delayed response - wanted to follow up on your interest.

ItssIMANNN has driven strong results for gaming and fantasy sports apps. His last campaign (Whiteout Survival) drove 48M views and 100K+ new users. The audience skews heavily toward young gamers who are exactly the fantasy sports demographic.

Would you be open to a quick call this week to discuss what Dream11 is looking for?

Best,
Jan`,
    days: 11,
    priority: 2
  },
  {
    name: 'Marina Hallikainen',
    company: 'Paradox',
    email: 'pr@paradoxinteractive.com',
    subject: 'RE: ItssIMANNN x Paradox Partnership',
    body: `Hi Marina,

Following up on your interest - appreciate you getting back to us.

ItssIMANNN's storytelling format works incredibly well for strategy games. His content is narrative-driven, which aligns perfectly with Paradox titles. We've seen strong results with gaming campaigns - his last one hit 48M views.

Would love to explore what a Cities: Skylines II or EU4 campaign could look like. Do you have 15 minutes this week for a quick chat?

Best,
Jan`,
    days: 11,
    priority: 3
  },
  // Unity moved to hot leads
  {
    name: 'Valeriya Kramp',
    company: 'Owlcat',
    email: 'kramp@owlcat.games',
    subject: 'RE: ItssIMANNN Partnership',
    body: `Hi Valeriya,

Apologies for the delayed follow-up. Wanted to reconnect on your interest.

ItssIMANNN's story-driven content style is a natural fit for RPGs like Pathfinder. His audience loves narrative-heavy gaming content. His last gaming campaign drove 48M views and 100K+ new users.

Would you be open to a quick call to discuss what Owlcat is looking for?

Best,
Jan`,
    days: 15,
    priority: 5
  },
  {
    name: 'Evgeny Zvyagin',
    company: 'Virtus.pro',
    email: 'e.zvyagin@virtus.pro',
    subject: 'RE: Virtus.pro x ItssIMANNN',
    body: `Hi Evgeny,

Following up on your interest in working with ItssIMANNN.

His gaming-focused audience (10M+ subs) overlaps heavily with esports fans. We've run successful gaming campaigns that drove 48M+ views. Could be a strong fit for Virtus.pro visibility in the US market.

Happy to discuss creative approaches. Do you have time for a quick call this week?

Best,
Jan`,
    days: 15,
    priority: 6
  },
  {
    name: 'Ilya Agron',
    company: 'Candivore',
    email: 'ilya@candivore.io',
    subject: 'RE: ItssIMANNN x Candivore',
    body: `Hi Ilya,

Following up on your interest - apologies for the delay.

ItssIMANNN has driven exceptional results for mobile games. His last campaign (Whiteout Survival) hit 48M views and 100K+ new users. The integration style works well for mobile - engaging storylines that keep viewers watching through the CTA.

Would love to chat about what Candivore is working on. Free for a quick call this week?

Best,
Jan`,
    days: 17,
    priority: 7
  },
  {
    name: 'Aurika Pociute',
    company: 'Eneba',
    email: 'aurika.pociute@eneba.com',
    subject: 'RE: Eneba x ItssIMANNN Partnership',
    body: `Hi Aurika,

Following up on your interest in ItssIMANNN.

With 10M+ gaming-focused subscribers, his audience is exactly Eneba's target market. His content style drives strong engagement - last gaming campaign hit 48M views.

Would love to explore what a partnership could look like. Do you have 15 minutes this week?

Best,
Jan`,
    days: 17,
    priority: 8
  },
  {
    name: 'Marcel Verboom',
    company: 'Poki',
    email: 'marcel@poki.com',
    subject: 'RE: Poki x ItssIMANNN',
    body: `Hi Marcel,

Wanted to follow up on your interest.

ItssIMANNN's younger audience aligns well with Poki's browser gaming platform. His content style drives high engagement - last gaming campaign hit 48M views and 100K+ new users.

Happy to discuss creative approaches for a Poki campaign. Free for a quick chat this week?

Best,
Jan`,
    days: 18,
    priority: 9
  }
];

// Generate mailto link
function generateMailto(lead) {
  const subject = encodeURIComponent(lead.subject);
  const body = encodeURIComponent(lead.body);
  return `mailto:${lead.email}?subject=${subject}&body=${body}`;
}

// Show terminal output
function showTerminal() {
  // Combine hot leads + gaming leads
  const allLeads = [...hotLeads, ...gamingLeads];
  const sent = allLeads.filter(l => isSent(l.email));
  const pending = allLeads.filter(l => !isSent(l.email));
  
  console.log(`\n${c.bold}📧 QUICK SEND - Ready to Send Emails${c.reset}\n`);
  console.log(`${c.dim}Click any link to open email client with pre-filled content${c.reset}`);
  console.log(`${c.green}✓ Sent: ${sent.length}${c.reset} | ${c.yellow}◯ Pending: ${pending.length}${c.reset}`);
  if (hotLeads.length > 0) {
    console.log(`${c.red}🔥 ${hotLeads.length} HOT LEADS - respond first!${c.reset}`);
  }
  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}\n`);

  let idx = 1;
  for (const lead of allLeads) {
    const urgencyColor = lead.hot ? c.red : (lead.days <= 3 ? c.red : (lead.days <= 7 ? c.yellow : c.dim));
    const mailto = generateMailto(lead);
    const sentStatus = isSent(lead.email) ? `${c.green}✓ SENT${c.reset}` : `${c.yellow}◯ pending${c.reset}`;
    const hotTag = lead.hot ? `${c.red}🔥 HOT${c.reset} ` : '';
    
    console.log(`${c.bold}${idx}. ${lead.name}${c.reset} @ ${lead.company} ${hotTag}${sentStatus}`);
    console.log(`   ${c.dim}${lead.email}${c.reset}`);
    console.log(`   ${urgencyColor}${lead.days} days waiting${c.reset}`);
    if (!isSent(lead.email)) {
      console.log(`   ${c.cyan}${mailto.substring(0, 80)}...${c.reset}`);
    }
    console.log('');
    idx++;
  }

  console.log(`${c.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}`);
  console.log(`\n${c.bold}Commands:${c.reset}`);
  console.log(`  ${c.cyan}gex send --html${c.reset}      Generate clickable HTML page`);
  console.log(`  ${c.cyan}gex send --mark 1${c.reset}    Mark email #1 as sent`);
  console.log(`  ${c.cyan}gex send --status${c.reset}    Show sent vs pending`);
  console.log(`\n${c.dim}Total: ${allLeads.length} emails | Sent: ${sent.length} | Pending: ${pending.length} | Potential: $150K-250K${c.reset}\n`);
}

// Generate HTML page with send buttons
function generateHTML() {
  const allLeads = [...hotLeads, ...gamingLeads];
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick Send - Hot Leads & Follow-ups</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { 
      text-align: center; 
      margin-bottom: 0.5rem;
      font-size: 2rem;
    }
    .subtitle {
      text-align: center;
      color: #888;
      margin-bottom: 2rem;
    }
    .stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      margin-bottom: 2rem;
    }
    .stat {
      text-align: center;
      background: rgba(255,255,255,0.1);
      padding: 1rem 2rem;
      border-radius: 8px;
    }
    .stat-value { font-size: 2rem; font-weight: bold; color: #4ade80; }
    .stat-label { font-size: 0.8rem; color: #888; }
    .card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1rem;
      border: 1px solid rgba(255,255,255,0.1);
      transition: all 0.2s;
    }
    .card:hover {
      background: rgba(255,255,255,0.1);
      border-color: #4ade80;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .priority {
      background: #4ade80;
      color: #000;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-weight: bold;
      font-size: 0.8rem;
    }
    .priority.urgent { background: #ef4444; color: #fff; }
    .priority.warning { background: #f59e0b; color: #000; }
    .name { font-size: 1.2rem; font-weight: bold; }
    .company { color: #888; }
    .email { color: #4ade80; font-size: 0.9rem; }
    .days { color: #888; font-size: 0.8rem; }
    .send-btn {
      display: inline-block;
      background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
      color: #000;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      text-decoration: none;
      font-weight: bold;
      margin-top: 1rem;
      transition: all 0.2s;
    }
    .send-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 4px 20px rgba(74, 222, 128, 0.4);
    }
    .footer {
      text-align: center;
      margin-top: 2rem;
      color: #666;
      font-size: 0.8rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📧 Quick Send</h1>
    <p class="subtitle">Gaming Follow-ups Ready to Send</p>
    
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${allLeads.length}</div>
        <div class="stat-label">Emails Ready</div>
      </div>
      <div class="stat">
        <div class="stat-value">$150K+</div>
        <div class="stat-label">Potential Value</div>
      </div>
    </div>

    ${allLeads.map((lead, idx) => {
      const priorityClass = lead.hot ? 'urgent' : (lead.days <= 3 ? 'urgent' : (lead.days <= 7 ? 'warning' : ''));
      const hotBadge = lead.hot ? '<span class="hot-badge">🔥 HOT</span>' : '';
      return `
    <div class="card ${lead.hot ? 'hot' : ''}">
      <div class="card-header">
        <div>
          <span class="name">${lead.name}</span>
          <span class="company">@ ${lead.company}</span>
          ${hotBadge}
        </div>
        <span class="priority ${priorityClass}">#${idx + 1}</span>
      </div>
      <div class="email">${lead.email}</div>
      <div class="days">${lead.days} days waiting</div>
      <a href="${generateMailto(lead)}" class="send-btn">📤 Send Email</a>
    </div>`;
    }).join('\n')}

    <p class="footer">Generated by GEX Quick Send • Click any button to open email client</p>
  </div>
</body>
</html>`;

  const filepath = path.join(__dirname, 'dashboard', 'quick-send.html');
  fs.writeFileSync(filepath, html);
  console.log(`\n${c.green}✓ Generated: ${filepath}${c.reset}`);
  console.log(`${c.dim}Open in browser to send emails with one click${c.reset}\n`);
  
  // Try to open in browser
  try {
    execSync(`open "${filepath}"`, { stdio: 'ignore' });
    console.log(`${c.cyan}Opened in browser${c.reset}\n`);
  } catch (e) {
    console.log(`${c.dim}Run: open "${filepath}"${c.reset}\n`);
  }
}

// Copy mailto link to clipboard
function copyToClipboard() {
  const allLeads = [...hotLeads, ...gamingLeads];
  const idx = parseInt(args[args.indexOf('--copy') + 1]) - 1;
  if (isNaN(idx) || idx < 0 || idx >= allLeads.length) {
    console.log(`${c.red}Invalid email number. Use 1-${allLeads.length}${c.reset}`);
    return;
  }
  
  const lead = allLeads[idx];
  const mailto = generateMailto(lead);
  
  try {
    execSync(`echo "${mailto}" | pbcopy`);
    console.log(`\n${c.green}✓ Copied mailto link for ${lead.name} @ ${lead.company}${c.reset}`);
    console.log(`${c.dim}Paste in browser to open email${c.reset}\n`);
  } catch (e) {
    console.log(`${c.yellow}Link: ${mailto}${c.reset}`);
  }
}

// Mark as sent
function markEmailSent() {
  const allLeads = [...hotLeads, ...gamingLeads];
  const idx = parseInt(args[args.indexOf('--mark') !== -1 ? args.indexOf('--mark') + 1 : args.indexOf('--sent') + 1]) - 1;
  if (isNaN(idx) || idx < 0 || idx >= allLeads.length) {
    console.log(`${c.red}Invalid email number. Use 1-${allLeads.length}${c.reset}`);
    return;
  }
  
  const lead = allLeads[idx];
  markAsSent(lead.email);
  console.log(`\n${c.green}✓ Marked as sent: ${lead.name} @ ${lead.company}${c.reset}`);
  console.log(`${c.dim}Email: ${lead.email}${c.reset}\n`);
}

// Show status
function showStatus() {
  const allLeads = [...hotLeads, ...gamingLeads];
  const data = loadSentData();
  const sent = allLeads.filter(l => isSent(l.email));
  const pending = allLeads.filter(l => !isSent(l.email));
  
  console.log(`\n${c.bold}📊 SEND STATUS${c.reset}\n`);
  console.log(`${c.green}✓ Sent: ${sent.length}${c.reset}`);
  console.log(`${c.yellow}◯ Pending: ${pending.length}${c.reset}`);
  console.log(`${c.dim}Total: ${allLeads.length}${c.reset}\n`);
  
  if (sent.length > 0) {
    console.log(`${c.green}Sent:${c.reset}`);
    for (const lead of sent) {
      const sentAt = data.sent[lead.email];
      console.log(`  ✓ ${lead.name} @ ${lead.company} (${new Date(sentAt).toLocaleDateString()})`);
    }
    console.log('');
  }
  
  if (pending.length > 0) {
    console.log(`${c.yellow}Pending:${c.reset}`);
    for (const lead of pending) {
      console.log(`  ◯ ${lead.name} @ ${lead.company} (${lead.days}d waiting)`);
    }
    console.log('');
  }
}

// Reset tracking
function resetTracking() {
  saveSentData({ sent: {}, history: [] });
  console.log(`\n${c.green}✓ Sent tracking reset${c.reset}\n`);
}

// Main
if (HTML) {
  generateHTML();
} else if (COPY) {
  copyToClipboard();
} else if (MARK) {
  markEmailSent();
} else if (STATUS) {
  showStatus();
} else if (RESET) {
  resetTracking();
} else {
  showTerminal();
}
