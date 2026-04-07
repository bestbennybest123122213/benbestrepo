/**
 * Bull BRO Context Memory
 * Remembers full conversation threads and summarizes for context
 */

const fs = require('fs');
const path = require('path');

const THREADS_FILE = path.join(__dirname, 'thread-memory.json');
const WINNING_FILE = path.join(__dirname, 'winning-replies.json');
const OBJECTIONS_FILE = path.join(__dirname, 'objection-playbook.json');

// Load threads
const loadThreads = () => {
  try {
    if (fs.existsSync(THREADS_FILE)) {
      return JSON.parse(fs.readFileSync(THREADS_FILE, 'utf8'));
    }
  } catch (e) {}
  return { threads: {} };
};

// Save threads
const saveThreads = (data) => {
  fs.writeFileSync(THREADS_FILE, JSON.stringify(data, null, 2));
};

// Get thread key from lead
const getThreadKey = (lead) => {
  return lead.email || lead.id || `${lead.firstName}_${lead.company}`.toLowerCase().replace(/\s+/g, '_');
};

// Add message to thread
const addToThread = (lead, message, sender = 'lead', metadata = {}) => {
  const data = loadThreads();
  const key = getThreadKey(lead);
  
  if (!data.threads[key]) {
    data.threads[key] = {
      lead: {
        email: lead.email,
        firstName: lead.firstName,
        company: lead.company,
        industry: lead.industry
      },
      messages: [],
      summary: null,
      objections: [],
      intents: [],
      status: 'active',
      createdAt: new Date().toISOString()
    };
  }
  
  data.threads[key].messages.push({
    sender,
    content: message,
    timestamp: new Date().toISOString(),
    ...metadata
  });
  
  data.threads[key].updatedAt = new Date().toISOString();
  
  // Track objections
  if (metadata.intent && metadata.intent.includes('objection')) {
    data.threads[key].objections.push(metadata.intent);
  }
  
  // Track intents
  if (metadata.intent) {
    if (!data.threads[key].intents.includes(metadata.intent)) {
      data.threads[key].intents.push(metadata.intent);
    }
  }
  
  saveThreads(data);
  return data.threads[key];
};

// Get thread context for a lead
const getThreadContext = (lead) => {
  const data = loadThreads();
  const key = getThreadKey(lead);
  const thread = data.threads[key];
  
  if (!thread) {
    return {
      isNew: true,
      messageCount: 0,
      summary: 'First contact with this lead.',
      previousIntents: [],
      objections: []
    };
  }
  
  return {
    isNew: false,
    messageCount: thread.messages.length,
    messages: thread.messages.slice(-5), // Last 5 messages
    summary: generateSummary(thread),
    previousIntents: thread.intents,
    objections: thread.objections,
    lastContact: thread.updatedAt,
    status: thread.status
  };
};

// Generate summary from thread
const generateSummary = (thread) => {
  const msgs = thread.messages;
  if (msgs.length === 0) return 'No previous conversation.';
  if (msgs.length === 1) return `1 previous message. Lead said: "${msgs[0].content.substring(0, 100)}..."`;
  
  const leadMsgs = msgs.filter(m => m.sender === 'lead');
  const ourMsgs = msgs.filter(m => m.sender === 'us');
  
  let summary = `${msgs.length} messages exchanged (${leadMsgs.length} from lead, ${ourMsgs.length} from us). `;
  
  if (thread.objections.length > 0) {
    summary += `Objections raised: ${thread.objections.join(', ')}. `;
  }
  
  if (thread.intents.length > 0) {
    summary += `Topics covered: ${thread.intents.slice(-3).join(', ')}. `;
  }
  
  // Last lead message
  if (leadMsgs.length > 0) {
    const last = leadMsgs[leadMsgs.length - 1];
    summary += `Last from lead: "${last.content.substring(0, 80)}..."`;
  }
  
  return summary;
};

// Mark thread as won (converted to call)
const markAsWon = (lead, winningReply) => {
  const data = loadThreads();
  const key = getThreadKey(lead);
  
  if (data.threads[key]) {
    data.threads[key].status = 'won';
    data.threads[key].wonAt = new Date().toISOString();
    saveThreads(data);
  }
  
  // Also add to winning replies
  const winData = JSON.parse(fs.readFileSync(WINNING_FILE, 'utf8'));
  winData.replies.push({
    id: `win_${Date.now()}`,
    lead: {
      company: lead.company,
      industry: lead.industry
    },
    reply: winningReply,
    intent: data.threads[key]?.intents.slice(-1)[0] || 'unknown',
    objections: data.threads[key]?.objections || [],
    timestamp: new Date().toISOString()
  });
  winData.stats.totalWins++;
  winData.lastUpdated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(WINNING_FILE, JSON.stringify(winData, null, 2));
  
  return { success: true, message: 'Marked as won and saved to winning replies' };
};

// Get conversation for drafting (don't repeat yourself)
const getContextForDraft = (lead) => {
  const context = getThreadContext(lead);
  
  const hints = [];
  
  if (!context.isNew) {
    hints.push(`This is message #${context.messageCount + 1} in the thread.`);
    
    // Don't repeat case studies we already mentioned
    const previousMsgs = context.messages?.filter(m => m.sender === 'us') || [];
    const mentionedCaseStudies = [];
    previousMsgs.forEach(m => {
      if (m.content?.includes('Whiteout')) mentionedCaseStudies.push('Whiteout Survival');
      if (m.content?.includes('Gauth')) mentionedCaseStudies.push('Gauth AI');
      if (m.content?.includes('Suno')) mentionedCaseStudies.push('Suno AI');
    });
    
    if (mentionedCaseStudies.length > 0) {
      hints.push(`Already mentioned: ${mentionedCaseStudies.join(', ')}. Use different examples.`);
    }
    
    // Track objections we've addressed
    if (context.objections.length > 0) {
      hints.push(`Previous objections: ${context.objections.join(', ')}`);
    }
  }
  
  return {
    ...context,
    hints,
    contextString: hints.join(' ')
  };
};

// Export
module.exports = {
  addToThread,
  getThreadContext,
  getContextForDraft,
  markAsWon,
  loadThreads,
  getThreadKey
};

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  
  if (cmd === 'list') {
    const data = loadThreads();
    const threads = Object.entries(data.threads);
    console.log(`🐂 Bull BRO Context Memory\n`);
    console.log(`${threads.length} thread(s) in memory:\n`);
    threads.forEach(([key, thread]) => {
      console.log(`• ${key}`);
      console.log(`  Company: ${thread.lead?.company || 'Unknown'}`);
      console.log(`  Messages: ${thread.messages.length}`);
      console.log(`  Status: ${thread.status}`);
      console.log(`  Last: ${thread.updatedAt || 'N/A'}\n`);
    });
  } else if (cmd === 'show' && args[1]) {
    const data = loadThreads();
    const thread = data.threads[args[1]];
    if (!thread) {
      console.log('Thread not found');
    } else {
      console.log(`🐂 Thread: ${args[1]}\n`);
      console.log(`Lead: ${thread.lead?.firstName} @ ${thread.lead?.company}`);
      console.log(`Status: ${thread.status}`);
      console.log(`Messages: ${thread.messages.length}\n`);
      console.log('--- Messages ---');
      thread.messages.forEach(m => {
        console.log(`[${m.sender}] ${m.content.substring(0, 100)}...`);
      });
    }
  } else if (cmd === 'context' && args[1]) {
    const context = getContextForDraft({ email: args[1] });
    console.log('🐂 Context for Draft:\n');
    console.log(JSON.stringify(context, null, 2));
  } else if (cmd === 'win' && args[1]) {
    const result = markAsWon({ email: args[1] }, args.slice(2).join(' ') || 'Reply that converted');
    console.log(result);
  } else {
    console.log('🐂 Bull BRO Context Memory');
    console.log('==========================\n');
    console.log('Commands:');
    console.log('  node context-memory.js list              - List all threads');
    console.log('  node context-memory.js show <email>      - Show thread details');
    console.log('  node context-memory.js context <email>   - Get drafting context');
    console.log('  node context-memory.js win <email> [reply] - Mark as converted');
  }
}
