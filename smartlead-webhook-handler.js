/**
 * SmartLead Webhook Handler - Bull Bro Auto-Reply Bot
 * Receives EMAIL_REPLIED webhooks, generates AI responses via Sonnet, sends replies
 *
 * Flow: Webhook → Deduplicate → Pull full thread → Sonnet generates response → Send via SmartLead API
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG - All secrets from environment variables
// ============================================================
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://rwhqshjmngkyremwandx.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY;
const SMARTLEAD_BASE_URL = 'https://server.smartlead.ai/api/v1';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const CALENDLY_API_TOKEN = process.env.CALENDLY_API_TOKEN;

// ============================================================
// DRAFT MODE vs AUTO-SEND MODE
// Set AUTO_SEND_ENABLED=true in Railway Variables when ready to go live
// Default: false (draft mode — generates responses but does NOT send them)
// ============================================================
const AUTO_SEND_ENABLED = process.env.AUTO_SEND_ENABLED === 'true';

// ============================================================
// LOAD BULL BRO'S BRAIN (SOUL + MEMORY + SOPs)
// ============================================================
let SYSTEM_PROMPT = '';

function loadBrainFiles() {
  try {
    const brainDir = path.join(__dirname, 'bull-bro-brain');
    const soul = fs.readFileSync(path.join(brainDir, 'SOUL.md'), 'utf8');
    const memory = fs.readFileSync(path.join(brainDir, 'MEMORY.md'), 'utf8');
    const sops = fs.readFileSync(path.join(brainDir, 'SOPs.md'), 'utf8');

    SYSTEM_PROMPT = `${soul}\n\n---\n\n${memory}\n\n---\n\n${sops}`;
    console.log('[BULL BRO] Brain files loaded successfully');
  } catch (err) {
    console.error('[BULL BRO] Failed to load brain files:', err.message);
    process.exit(1);
  }
}

// Load on startup
loadBrainFiles();

// ============================================================
// DEDUPLICATION - Track processed message IDs
// ============================================================
const processedMessages = new Map(); // message_id -> timestamp

function isDuplicate(messageId) {
  if (!messageId) return false;
  if (processedMessages.has(messageId)) {
    console.log(`[DEDUP] Duplicate webhook for message: ${messageId}`);
    return true;
  }
  processedMessages.set(messageId, Date.now());
  // Clean old entries (older than 24h)
  const oneDayAgo = Date.now() - 86400000;
  for (const [key, timestamp] of processedMessages) {
    if (timestamp < oneDayAgo) processedMessages.delete(key);
  }
  return false;
}

// ============================================================
// PROCESSING QUEUE - Rate limiting
// ============================================================
const responseQueue = [];
let isProcessing = false;

function enqueueResponse(task) {
  responseQueue.push(task);
  if (!isProcessing) processQueue();
}

async function processQueue() {
  if (responseQueue.length === 0) {
    isProcessing = false;
    return;
  }
  isProcessing = true;
  const task = responseQueue.shift();

  try {
    await processAutoReply(task);
  } catch (err) {
    console.error('[QUEUE] Processing error:', err.message);
  }

  // 3 second delay between responses
  setTimeout(() => processQueue(), 3000);
}

// ============================================================
// SMARTLEAD API - Pull thread & send replies
// ============================================================

/**
 * Pull full conversation thread for a lead
 */
async function getFullThread(campaignId, leadId) {
  try {
    if (!campaignId || !leadId) {
      console.warn('[SMARTLEAD] Missing campaignId or leadId for thread pull');
      return null;
    }

    const url = `${SMARTLEAD_BASE_URL}/campaigns/${campaignId}/leads/${leadId}/message-history?api_key=${SMARTLEAD_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      console.error('[SMARTLEAD] Thread pull failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error('[SMARTLEAD] Thread pull error:', err.message);
    return null;
  }
}

/**
 * Send a reply via SmartLead API
 */
async function sendReply(campaignId, leadId, replyText) {
  try {
    const url = `${SMARTLEAD_BASE_URL}/campaigns/${campaignId}/leads/${leadId}/reply?api_key=${SMARTLEAD_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: replyText
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[SMARTLEAD] Send reply failed:', response.status, errText);
      return false;
    }

    console.log('[SMARTLEAD] Reply sent successfully');
    return true;
  } catch (err) {
    console.error('[SMARTLEAD] Send reply error:', err.message);
    return false;
  }
}

/**
 * Update lead category in SmartLead
 */
async function updateLeadCategory(campaignId, leadId, category) {
  try {
    const url = `${SMARTLEAD_BASE_URL}/campaigns/${campaignId}/leads/${leadId}/status?api_key=${SMARTLEAD_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: category
      })
    });

    if (!response.ok) {
      console.error('[SMARTLEAD] Category update failed:', response.status);
    }
  } catch (err) {
    console.error('[SMARTLEAD] Category update error:', err.message);
  }
}

// ============================================================
// CALENDLY API - Check availability
// ============================================================

async function getAvailableSlots() {
  try {
    if (!CALENDLY_API_TOKEN) {
      console.warn('[CALENDLY] No API token configured, skipping availability check');
      return null;
    }

    // Get user URI first
    const meResponse = await fetch('https://api.calendly.com/users/me', {
      headers: { 'Authorization': `Bearer ${CALENDLY_API_TOKEN}` }
    });

    if (!meResponse.ok) return null;
    const meData = await meResponse.json();
    const userUri = meData.resource.uri;

    // Get event types
    const eventsResponse = await fetch(`https://api.calendly.com/event_types?user=${userUri}&active=true`, {
      headers: { 'Authorization': `Bearer ${CALENDLY_API_TOKEN}` }
    });

    if (!eventsResponse.ok) return null;
    const eventsData = await eventsResponse.json();

    if (!eventsData.collection || eventsData.collection.length === 0) return null;

    const eventType = eventsData.collection[0].uri;

    // Get available times for the next 14 days
    const now = new Date();
    const startTime = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    const endTime = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

    const availResponse = await fetch(
      `https://api.calendly.com/event_type_available_times?event_type=${eventType}&start_time=${startTime.toISOString()}&end_time=${endTime.toISOString()}`,
      { headers: { 'Authorization': `Bearer ${CALENDLY_API_TOKEN}` } }
    );

    if (!availResponse.ok) return null;
    const availData = await availResponse.json();

    // Format into readable time slots
    return formatTimeSlots(availData.collection);
  } catch (err) {
    console.error('[CALENDLY] Error fetching availability:', err.message);
    return null;
  }
}

/**
 * Format Calendly available times into Bull Bro friendly time slots
 * Pick 2 slots on different weekdays, at least 2 days out, in EST
 */
function formatTimeSlots(availableTimes) {
  if (!availableTimes || availableTimes.length === 0) return null;

  const slots = availableTimes
    .map(slot => new Date(slot.start_time))
    .filter(date => {
      const day = date.getDay();
      return day >= 1 && day <= 5; // Weekdays only
    });

  if (slots.length < 2) return null;

  // Group by day
  const byDay = {};
  for (const slot of slots) {
    const dayKey = slot.toISOString().split('T')[0];
    if (!byDay[dayKey]) byDay[dayKey] = [];
    byDay[dayKey].push(slot);
  }

  const days = Object.keys(byDay).sort();
  if (days.length < 2) return null;

  // Pick 2 different days
  const day1 = days[0];
  const day2 = days.find(d => d !== day1) || days[1];

  // Pick 2 times per day (morning-ish and afternoon-ish)
  function pickTimes(daySlots) {
    const morning = daySlots.find(s => s.getUTCHours() >= 15 && s.getUTCHours() <= 17); // 10am-12pm EST
    const afternoon = daySlots.find(s => s.getUTCHours() >= 18 && s.getUTCHours() <= 21); // 1pm-4pm EST
    return [morning || daySlots[0], afternoon || daySlots[daySlots.length - 1]];
  }

  const times1 = pickTimes(byDay[day1]);
  const times2 = pickTimes(byDay[day2]);

  // Format to EST
  function formatEST(date) {
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: undefined,
      hour12: true,
      timeZone: 'America/New_York'
    }).replace(',', '');
  }

  const slot1a = formatEST(times1[0]);
  const slot1b = formatEST(times1[1]);
  const slot2a = formatEST(times2[0]);
  const slot2b = formatEST(times2[1]);

  return `I'm free ${slot1a} or ${slot1b} and ${slot2a} or ${slot2b} EST, either works?`;
}

// ============================================================
// SONNET API - Generate Bull Bro response
// ============================================================

async function generateResponse(leadName, leadCompany, leadEmail, fromEmail, replyText, fullThread, availableSlots) {
  try {
    if (!ANTHROPIC_API_KEY) {
      console.error('[SONNET] No API key configured');
      return { type: 'ESCALATE', reason: 'No Anthropic API key configured' };
    }

    // Build the user prompt with all context
    const isJanMailbox = fromEmail && (fromEmail.includes('jan') || fromEmail.includes('3wrk'));

    let userPrompt = `You are Bull Bro. Process this SmartLead email reply.\n\n`;
    userPrompt += `LEAD INFO:\n`;
    userPrompt += `- Name: ${leadName || 'Unknown'}\n`;
    userPrompt += `- Company: ${leadCompany || 'Unknown'}\n`;
    userPrompt += `- Email: ${leadEmail}\n`;
    userPrompt += `- Mailbox: ${isJanMailbox ? 'Jan' : 'Imman'}\n\n`;

    if (availableSlots) {
      userPrompt += `AVAILABLE TIME SLOTS (from Calendly - real availability):\n${availableSlots}\n\n`;
    }

    if (fullThread) {
      userPrompt += `FULL EMAIL THREAD (oldest to newest):\n`;
      if (Array.isArray(fullThread)) {
        for (const msg of fullThread) {
          const direction = msg.type === 'SENT' ? 'US →' : '← LEAD';
          const time = msg.time || msg.created_at || '';
          const body = msg.body || msg.text || msg.message || '';
          userPrompt += `[${direction}] ${time}\n${body}\n\n`;
        }
      } else {
        userPrompt += `${JSON.stringify(fullThread, null, 2)}\n\n`;
      }
    }

    userPrompt += `LATEST REPLY FROM LEAD:\n${replyText}\n\n`;
    userPrompt += `INSTRUCTIONS:\n`;
    userPrompt += `1. Categorize this reply (Interested, Information Request, Meeting Request, Booked, Not Interested, Wrong Person, Do Not Contact, Out of Office)\n`;
    userPrompt += `2. MEMORY rules ALWAYS override SOP templates. Never copy-paste SOP templates verbatim. Use them as reference only and rephrase in context of the thread. Keep responses concise — every sentence must earn its place.\n`;    userPrompt += `3. If you are not confident, output ESCALATE: [reason] instead of a response\n`;
    userPrompt += `4. If the lead should be blocked (Do Not Contact), output BLOCK: [reason]\n`;
    userPrompt += `5. If the lead is OOO, output OOO: [return date if available]\n`;
    userPrompt += `6. Otherwise, output your response in this exact format:\n`;
    userPrompt += `CATEGORY: [category]\n`;
    userPrompt += `SMARTLEAD_STATUS: [the status to set in SmartLead]\n`;
    userPrompt += `RESPONSE:\n[your email response here]\n`;

    // Call Sonnet API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[SONNET] API error:', response.status, errText);
      return { type: 'ESCALATE', reason: `Sonnet API error: ${response.status}` };
    }

    const data = await response.json();
    const aiResponse = data.content[0].text;

    console.log('[SONNET] Raw response:', aiResponse.substring(0, 200));

    // Parse the response
    return parseAIResponse(aiResponse);

  } catch (err) {
    console.error('[SONNET] Error:', err.message);
    return { type: 'ESCALATE', reason: `Sonnet error: ${err.message}` };
  }
}

/**
 * Parse Sonnet's response into actionable parts
 */
function parseAIResponse(aiResponse) {
  const text = aiResponse.trim();

  // Check for ESCALATE
  if (text.startsWith('ESCALATE:') || text.includes('ESCALATE:')) {
    const reason = text.replace('ESCALATE:', '').trim();
    return { type: 'ESCALATE', reason };
  }

  // Check for BLOCK
  if (text.startsWith('BLOCK:') || text.includes('BLOCK:')) {
    const reason = text.replace('BLOCK:', '').trim();
    return { type: 'BLOCK', reason };
  }

  // Check for OOO
  if (text.startsWith('OOO:') || text.includes('OOO:')) {
    const info = text.replace('OOO:', '').trim();
    return { type: 'OOO', info };
  }

  // Parse normal response
  const categoryMatch = text.match(/CATEGORY:\s*(.+)/);
  const statusMatch = text.match(/SMARTLEAD_STATUS:\s*(.+)/);
  const responseMatch = text.match(/RESPONSE:\s*([\s\S]+)/);

  if (!responseMatch) {
    // If format is wrong but there's content, use the whole thing
    return { type: 'ESCALATE', reason: 'Could not parse AI response format', rawResponse: text };
  }

  return {
    type: 'REPLY',
    category: categoryMatch ? categoryMatch[1].trim() : 'Unknown',
    smartleadStatus: statusMatch ? statusMatch[1].trim() : null,
    response: responseMatch[1].trim()
  };
}

// ============================================================
// MAIN PROCESSING LOGIC
// ============================================================

async function processAutoReply(task) {
  const { payload, webhookReceivedAt } = task;

  const leadEmail = payload.to_email || payload.lead?.email;
  const leadName = payload.to_name || `${payload.lead?.first_name || ''} ${payload.lead?.last_name || ''}`.trim();
  const leadCompany = payload.lead?.company_name || extractCompanyFromEmail(leadEmail);
  const fromEmail = payload.from_email;
  const rawCampaignId = payload.campaign_id;
  const campaignId = rawCampaignId && !isNaN(rawCampaignId) ? String(rawCampaignId) : null;
  const campaignName = payload.campaign_name;
  const rawLeadId = payload.sl_email_lead_id || payload.stats_id || payload.lead_id;
  const leadId = rawLeadId && !isNaN(rawLeadId) ? String(rawLeadId) : null;
  const replyBody = payload.reply_message?.text || payload.reply_body || payload.preview_text || payload.reply?.body || '';
  const replyReceivedAt = payload.event_timestamp || payload.time_replied || payload.reply_message?.time;

  console.log(`[PROCESS] Starting auto-reply for ${leadEmail} (${leadCompany})`);

  // Check for empty/corrupted reply
  if (!replyBody || replyBody.trim().length === 0) {
    console.log('[PROCESS] Empty reply body — flagging for escalation');
    await sendEscalation(`Empty reply from ${leadName} (${leadCompany}) - ${leadEmail}. Webhook received but no email content.`);
    return;
  }

  // Calculate and apply delay
  const delayMinutes = calculateDelay(replyReceivedAt, webhookReceivedAt);
  if (delayMinutes > 0) {
    console.log(`[PROCESS] Waiting ${delayMinutes.toFixed(1)} minutes before processing...`);
    await new Promise(resolve => setTimeout(resolve, delayMinutes * 60 * 1000));
  }

  // Step 1: Pull full thread from SmartLead
  console.log('[PROCESS] Pulling full thread...');
  const fullThread = await getFullThread(campaignId, leadId);

  // Step 2: Check Calendly availability
  console.log('[PROCESS] Checking Calendly availability...');
  const availableSlots = await getAvailableSlots();

  // Step 3: Generate response via Sonnet
  console.log('[PROCESS] Generating response via Sonnet...');
  const aiResult = await generateResponse(
    leadName, leadCompany, leadEmail, fromEmail,
    replyBody, fullThread, availableSlots
  );

  console.log(`[PROCESS] AI result type: ${aiResult.type}`);

  // Step 4: Handle the result
  switch (aiResult.type) {
    case 'ESCALATE':
      console.log(`[PROCESS] ESCALATING: ${aiResult.reason}`);
      await sendEscalation(
        `🚨 ESCALATION: ${leadName} (${leadCompany})\n` +
        `Email: ${leadEmail}\n` +
        `Reason: ${aiResult.reason}\n` +
        `Reply preview: ${replyBody.substring(0, 200)}\n` +
        `View: https://bull-os-production.up.railway.app/auto-reply.html`
      );
      // Log as escalated
      await updateDraftStatus(payload, aiResult, 'escalated');
      break;

    case 'BLOCK':
      console.log(`[PROCESS] BLOCKING: ${leadEmail}`);
      await sendEscalation(
        `🚫 BLOCKED: ${leadName} (${leadCompany})\n` +
        `Email: ${leadEmail}\n` +
        `Reason: ${aiResult.reason}`
      );
      // Update SmartLead status
      if (campaignId && leadId) {
        await updateLeadCategory(campaignId, leadId, 'Do Not Contact');
      }
      await updateDraftStatus(payload, aiResult, 'blocked');
      break;

    case 'OOO':
      console.log(`[PROCESS] OOO detected: ${aiResult.info}`);
      await sendTelegramNotification({
        leadEmail, leadName, leadCompany, campaignName,
        subcategory: 'out_of_office',
        replyPreview: `OOO - ${aiResult.info || 'No return date'}`
      });
      await updateDraftStatus(payload, aiResult, 'ooo');
      break;

    case 'REPLY':
      console.log(`[PROCESS] Generated reply (category: ${aiResult.category}) | Mode: ${AUTO_SEND_ENABLED ? 'AUTO-SEND' : 'DRAFT'}`);

      if (!AUTO_SEND_ENABLED) {
        // ========== DRAFT MODE ==========
        // Save draft to Supabase, notify on Telegram, but do NOT send
        console.log(`[PROCESS] DRAFT MODE — saving draft for ${leadEmail}, NOT sending`);

        await sendTelegramNotification({
          leadEmail, leadName, leadCompany, campaignName,
          subcategory: aiResult.category.toLowerCase().replace(' ', '_'),
          replyPreview: `📝 DRAFT (not sent):\n\nLead said: "${replyBody.substring(0, 200)}"\n\nBull Bro drafted:\n${aiResult.response}`
        });

        await updateDraftStatus(payload, aiResult, 'draft');

      } else {
        // ========== AUTO-SEND MODE ==========
        // Send the reply via SmartLead
        if (campaignId && leadId) {
          const sent = await sendReply(campaignId, leadId, aiResult.response);

          if (sent) {
            console.log(`[PROCESS] Reply sent to ${leadEmail}`);

            if (aiResult.smartleadStatus) {
              await updateLeadCategory(campaignId, leadId, aiResult.smartleadStatus);
            }

            const positiveCategories = ['Interested', 'Information Request', 'Meeting Request', 'Booked'];
            if (positiveCategories.includes(aiResult.category)) {
              await sendTelegramNotification({
                leadEmail, leadName, leadCompany, campaignName,
                subcategory: aiResult.category.toLowerCase().replace(' ', '_'),
                replyPreview: `✅ Auto-replied: ${aiResult.response.substring(0, 100)}`
              });
            }

            await updateDraftStatus(payload, aiResult, 'sent');
          } else {
            console.error(`[PROCESS] Failed to send reply to ${leadEmail}`);
            await sendEscalation(
              `⚠️ SEND FAILED: ${leadName} (${leadCompany})\n` +
              `Email: ${leadEmail}\n` +
              `Draft response was: ${aiResult.response.substring(0, 200)}\n` +
              `Please send manually.`
            );
            await updateDraftStatus(payload, aiResult, 'send_failed');
          }
        } else {
          console.error('[PROCESS] Missing campaignId or leadId — cannot send');
          await sendEscalation(
            `⚠️ MISSING IDS: ${leadName} (${leadCompany})\n` +
            `Email: ${leadEmail}\n` +
            `Cannot send — missing campaign or lead ID.\n` +
            `Draft: ${aiResult.response.substring(0, 200)}`
          );
        }
      }
      break;
  }
}

// ============================================================
// DRAFT STATUS LOGGING (Supabase)
// ============================================================

async function updateDraftStatus(payload, aiResult, status) {
  try {
    const leadEmail = payload.to_email || payload.lead?.email;
    const replyBody = payload.reply_message?.text || payload.reply_body || '';

    await supabase.from('smartlead_webhook_log').insert({
      event: 'AUTO_REPLY_PROCESSED',
      lead_email: leadEmail,
      lead_name: payload.to_name,
      lead_company: payload.lead?.company_name || extractCompanyFromEmail(leadEmail),
      campaign_id: payload.campaign_id ? String(payload.campaign_id) : null,
      campaign_name: payload.campaign_name,
      reply_body: replyBody,
      category: aiResult.category || aiResult.type,
      subcategory: status,
      processed: true,
      ai_response: aiResult.response || aiResult.reason || aiResult.info || null
    });
  } catch (err) {
    console.error('[LOG] Failed to log draft status:', err.message);
  }
}

// ============================================================
// TELEGRAM - Notifications & Escalations
// ============================================================

async function sendEscalation(message) {
  await sendSlackMessage(message);
}

async function sendTelegramNotification(data) {
  try {
    const { leadEmail, leadName, leadCompany, campaignName, subcategory, replyPreview } = data;
    
    const categoryEmoji = {
      'interested': '✨',
      'meeting_request': '📅',
      'info_request': '❓',
      'information_request': '❓',
      'booked': '🎯',
      'out_of_office': '🏖️'
    };
    
    const emoji = categoryEmoji[subcategory] || '📬';
    const displayName = leadName || leadEmail;
    const displayCompany = leadCompany ? ` (${leadCompany})` : '';
    
    const message = `${emoji} Bull Bro Auto-Reply\n\n` +
      `${displayName}${displayCompany}\n` +
      `Category: ${subcategory.replace(/_/g, ' ')}\n` +
      `Campaign: ${campaignName || 'Unknown'}\n\n` +
      `${replyPreview}\n\n` +
      `View: https://bull-os-production.up.railway.app/auto-reply.html`;
    
    await sendSlackMessage(message);
  } catch (err) {
    console.error('[SLACK] Notification error:', err.message);
  }
}

async function sendSlackMessage(text) {
  try {
    if (!SLACK_WEBHOOK_URL) {
      console.warn('[SLACK] No webhook URL configured, skipping');
      return;
    }
    
    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
    
    if (!response.ok) {
      console.error('[SLACK] Send failed:', await response.text());
    } else {
      console.log('[SLACK] Message sent');
    }
  } catch (err) {
    console.error('[SLACK] Error:', err.message);
  }
}

// ============================================================
// DELAY CALCULATION
// ============================================================

function calculateDelay(emailReceivedAt, webhookReceivedAt) {
  const emailTime = new Date(emailReceivedAt).getTime();
  const webhookTime = new Date(webhookReceivedAt).getTime();
  const alreadyDelayed = (webhookTime - emailTime) / 1000 / 60;

  // Random delay 2-4 minutes
  const targetDelay = 2 + Math.random() * 2;

  if (alreadyDelayed >= targetDelay) {
    return 0.5; // Already delayed enough
  }

  return targetDelay - alreadyDelayed;
}

// ============================================================
// UTILITY
// ============================================================

function extractCompanyFromEmail(email) {
  if (!email) return null;
  const domain = email.split('@')[1];
  if (!domain) return null;
  const company = domain.split('.')[0];
  return company.charAt(0).toUpperCase() + company.slice(1);
}

// ============================================================
// WEBHOOK ENDPOINT
// ============================================================

async function handleWebhook(req, res) {
  const webhookReceivedAt = new Date().toISOString();
  const payload = req.body;

  const eventType = payload.event || payload.event_type;
  console.log(`[WEBHOOK] Received ${eventType} at ${webhookReceivedAt}`);

  // Acknowledge immediately
  res.status(200).json({ status: 'received', timestamp: webhookReceivedAt });

  // Only process EMAIL_REPLY or EMAIL_REPLIED
  if (eventType !== 'EMAIL_REPLIED' && eventType !== 'EMAIL_REPLY') {
    console.log(`[WEBHOOK] Ignoring event: ${eventType}`);
    return;
  }

  // Deduplication check
  const messageId = payload.reply_message?.message_id || payload.message_id;
  if (isDuplicate(messageId)) return;

  // Log to Supabase (raw webhook)
  try {
    const leadEmail = payload.to_email || payload.lead?.email;
    const leadName = payload.to_name;
    const replyBody = payload.reply_message?.text || payload.reply_body || '';

    await supabase.from('smartlead_webhook_log').insert({
      event: eventType,
      campaign_id: payload.campaign_id ? String(payload.campaign_id) : null,
      campaign_name: payload.campaign_name,
      lead_id: payload.sl_email_lead_id || payload.stats_id ? String(payload.sl_email_lead_id || payload.stats_id) : null,
      lead_email: leadEmail,
      lead_name: leadName,
      reply_body: replyBody,
      reply_received_at: payload.event_timestamp || payload.time_replied,
      webhook_received_at: webhookReceivedAt,
      processed: false
    });
  } catch (err) {
    console.error('[WEBHOOK] Failed to log:', err.message);
  }

  // Enqueue for processing
  enqueueResponse({ payload, webhookReceivedAt });
}

async function handleTest(req, res) {
  res.json({
    status: 'ok',
    message: 'Bull Bro Auto-Reply is active',
    mode: AUTO_SEND_ENABLED ? 'AUTO-SEND (live)' : 'DRAFT (review only)',
    brainLoaded: SYSTEM_PROMPT.length > 0,
    brainSize: `${(SYSTEM_PROMPT.length / 1024).toFixed(1)}KB`,
    queueLength: responseQueue.length,
    timestamp: new Date().toISOString()
  });
}

module.exports = { handleWebhook, handleTest };
