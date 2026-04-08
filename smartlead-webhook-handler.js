/**
 * SmartLead Webhook Handler - Bull Bro Auto-Reply Bot
 * Receives EMAIL_REPLIED webhooks, generates AI responses via Sonnet, sends replies
 *
 * Flow: Webhook -> Deduplicate -> Pull full thread -> Sonnet generates response -> Send via SmartLead API
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
// ============================================================
const AUTO_SEND_ENABLED = process.env.AUTO_SEND_ENABLED === 'true';

// ============================================================
// LOAD BULL BRO'S BRAIN (SOUL + MEMORY + SOPs)
// ============================================================
var SYSTEM_PROMPT = '';

function loadBrainFiles() {
  try {
    var brainDir = path.join(__dirname, 'bull-bro-brain');
    var soul = fs.readFileSync(path.join(brainDir, 'SOUL.md'), 'utf8');
    var memory = fs.readFileSync(path.join(brainDir, 'MEMORY.md'), 'utf8');
    var sops = fs.readFileSync(path.join(brainDir, 'SOPs.md'), 'utf8');
    SYSTEM_PROMPT = soul + '\n\n---\n\n' + memory + '\n\n---\n\n' + sops;
    console.log('[BULL BRO] Brain files loaded successfully');
  } catch (err) {
    console.error('[BULL BRO] Failed to load brain files:', err.message);
    process.exit(1);
  }
}

loadBrainFiles();

// ============================================================
// DEDUPLICATION
// ============================================================
var processedMessages = new Map();

function isDuplicate(messageId) {
  if (!messageId) return false;
  if (processedMessages.has(messageId)) {
    console.log('[DEDUP] Duplicate webhook for message: ' + messageId);
    return true;
  }
  processedMessages.set(messageId, Date.now());
  var oneDayAgo = Date.now() - 86400000;
  for (var entry of processedMessages) {
    if (entry[1] < oneDayAgo) processedMessages.delete(entry[0]);
  }
  return false;
}

// ============================================================
// PROCESSING QUEUE
// ============================================================
var responseQueue = [];
var isProcessing = false;

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
  var task = responseQueue.shift();
  try {
    await processAutoReply(task);
  } catch (err) {
    console.error('[QUEUE] Processing error:', err.message);
  }
  setTimeout(function() { processQueue(); }, 3000);
}

// ============================================================
// SMARTLEAD API
// ============================================================

async function getFullThread(campaignId, leadId) {
  try {
    if (!campaignId || !leadId) {
      console.warn('[SMARTLEAD] Missing campaignId or leadId for thread pull');
      return null;
    }
    var url = SMARTLEAD_BASE_URL + '/campaigns/' + campaignId + '/leads/' + leadId + '/message-history?api_key=' + SMARTLEAD_API_KEY;
    var response = await fetch(url);
    if (!response.ok) {
      console.error('[SMARTLEAD] Thread pull failed:', response.status);
      return null;
    }
    return await response.json();
  } catch (err) {
    console.error('[SMARTLEAD] Thread pull error:', err.message);
    return null;
  }
}

async function sendReply(campaignId, emailStatsId, replyText) {
  try {
    var url = SMARTLEAD_BASE_URL + '/campaigns/' + campaignId + '/reply-email-thread?api_key=' + SMARTLEAD_API_KEY;
    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email_stats_id: emailStatsId,
        email_body: replyText.replace(/\r\n/g, '\n').replace(/\n/g, '<br>'),
        add_signature: false
      })
    });
    if (!response.ok) {
      var errText = await response.text();
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

async function updateLeadCategory(campaignId, leadId, category) {
  try {
    var url = SMARTLEAD_BASE_URL + '/campaigns/' + campaignId + '/leads/' + leadId + '/status?api_key=' + SMARTLEAD_API_KEY;
    var response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: category })
    });
    if (!response.ok) {
      console.error('[SMARTLEAD] Category update failed:', response.status);
    }
  } catch (err) {
    console.error('[SMARTLEAD] Category update error:', err.message);
  }
}

// ============================================================
// CALENDLY API
// ============================================================

async function getAvailableSlots() {
  try {
    if (!CALENDLY_API_TOKEN) {
      console.warn('[CALENDLY] No API token configured, skipping');
      return null;
    }
    var meResponse = await fetch('https://api.calendly.com/users/me', {
      headers: { 'Authorization': 'Bearer ' + CALENDLY_API_TOKEN }
    });
    if (!meResponse.ok) return null;
    var meData = await meResponse.json();
    var userUri = meData.resource.uri;

    var eventsResponse = await fetch('https://api.calendly.com/event_types?user=' + userUri + '&active=true', {
      headers: { 'Authorization': 'Bearer ' + CALENDLY_API_TOKEN }
    });
    if (!eventsResponse.ok) return null;
    var eventsData = await eventsResponse.json();
    if (!eventsData.collection || eventsData.collection.length === 0) return null;

    var eventType = eventsData.collection[0].uri;
    var now = new Date();
    var startTime = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    var endTime = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    var availResponse = await fetch(
      'https://api.calendly.com/event_type_available_times?event_type=' + eventType + '&start_time=' + startTime.toISOString() + '&end_time=' + endTime.toISOString(),
      { headers: { 'Authorization': 'Bearer ' + CALENDLY_API_TOKEN } }
    );
    if (!availResponse.ok) return null;
    var availData = await availResponse.json();
    return formatTimeSlots(availData.collection);
  } catch (err) {
    console.error('[CALENDLY] Error:', err.message);
    return null;
  }
}

function formatTimeSlots(availableTimes) {
  if (!availableTimes || availableTimes.length === 0) return null;
  var slots = [];
  for (var s = 0; s < availableTimes.length; s++) {
    var d = new Date(availableTimes[s].start_time);
    if (d.getDay() >= 1 && d.getDay() <= 5) slots.push(d);
  }
  if (slots.length < 2) return null;

  var byDay = {};
  for (var i = 0; i < slots.length; i++) {
    var dayKey = slots[i].toISOString().split('T')[0];
    if (!byDay[dayKey]) byDay[dayKey] = [];
    byDay[dayKey].push(slots[i]);
  }
  var days = Object.keys(byDay).sort();
  if (days.length < 2) return null;

  var day1 = days[0];
  var day2 = null;
  for (var j = 1; j < days.length; j++) {
    if (days[j] !== day1) { day2 = days[j]; break; }
  }
  if (!day2) day2 = days[1];

  function pickTimes(daySlots) {
    var morning = null;
    var afternoon = null;
    for (var k = 0; k < daySlots.length; k++) {
      if (!morning && daySlots[k].getUTCHours() >= 15 && daySlots[k].getUTCHours() <= 17) morning = daySlots[k];
      if (!afternoon && daySlots[k].getUTCHours() >= 18 && daySlots[k].getUTCHours() <= 21) afternoon = daySlots[k];
    }
    return [morning || daySlots[0], afternoon || daySlots[daySlots.length - 1]];
  }

  var times1 = pickTimes(byDay[day1]);
  var times2 = pickTimes(byDay[day2]);

  function formatEST(date) {
    return date.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', hour12: true, timeZone: 'America/New_York'
    }).replace(',', '');
  }

  return "I'm free " + formatEST(times1[0]) + " or " + formatEST(times1[1]) + " and " + formatEST(times2[0]) + " or " + formatEST(times2[1]) + " EST, either works?";
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

    var isJanMailbox = fromEmail && (fromEmail.includes('jan') || fromEmail.includes('3wrk'));

    var userPrompt = 'You are Bull Bro. Process this SmartLead email reply.\n\n';
    userPrompt += 'LEAD INFO:\n';
    userPrompt += '- Name: ' + (leadName || 'Unknown') + '\n';
    userPrompt += '- Company: ' + (leadCompany || 'Unknown') + '\n';
    userPrompt += '- Email: ' + leadEmail + '\n';
    userPrompt += '- Mailbox: ' + (isJanMailbox ? 'Jan' : 'Imman') + '\n\n';

    if (availableSlots) {
      userPrompt += 'AVAILABLE TIME SLOTS (from Calendly - real availability):\n' + availableSlots + '\n\n';
    }

    if (fullThread) {
      userPrompt += 'FULL EMAIL THREAD (oldest to newest):\n';
      if (Array.isArray(fullThread)) {
        for (var i = 0; i < fullThread.length; i++) {
          var msg = fullThread[i];
          var direction = msg.type === 'SENT' ? 'US ->' : '<- LEAD';
          var time = msg.time || msg.created_at || '';
          var body = msg.body || msg.text || msg.message || '';
          userPrompt += '[' + direction + '] ' + time + '\n' + body + '\n\n';
        }
      } else {
        userPrompt += JSON.stringify(fullThread, null, 2) + '\n\n';
      }
    }

    userPrompt += 'LATEST REPLY FROM LEAD:\n' + replyText + '\n\n';
    userPrompt += 'INSTRUCTIONS (FOLLOW EVERY SINGLE ONE):\n';
    userPrompt += '1. Categorize this reply: Interested, Information Request, Meeting Request, Booked, Not Interested, Wrong Person, Do Not Contact, Out of Office\n';
    userPrompt += '2. MEMORY rules ALWAYS override SOP templates. NEVER copy-paste SOP template wording. Write fresh in a casual, direct tone. Keep responses short: 2-4 sentences for simple replies, 4-6 for detailed questions. Every sentence must earn its place.\n';
    userPrompt += '3. NEVER open with a self-introduction. Do NOT say "I am a comedy/gaming creator" or "we are a comedy/lifestyle/gaming channel" or "I run ItssIMANNN" or any variation. The lead already knows who you are. Jump straight to answering what they asked.\n';
    userPrompt += '4. NEVER use these forbidden phrases: "no worries", "appreciate you getting back", "appreciate you circling back", "thanks for getting back to me", "I appreciate your interest", "thanks for letting me know", "looking forward to hearing from you", "no problem", "all good", "no rush".\n';
    userPrompt += '5. If company name is unknown or is a generic email provider (Gmail, Yahoo, Hotmail, etc), do NOT reference any company name.\n';
    userPrompt += '6. When lead asks multiple things, pick the ONE strongest signal. Do not try to answer everything.\n';
    userPrompt += '7. NEVER volunteer pricing unless lead explicitly asked about pricing/rates/cost. "Tell me more" does NOT mean send pricing.\n';
    userPrompt += '8. When lead provides their own booking/calendar link: if Imman mailbox say "My business partner Jan (jan@3wrk.com) will book a time on your calendar shortly. Talk soon." If Jan mailbox say "I will book a time on your calendar shortly. Talk soon."\n';
    userPrompt += '9. For Not Interested: ALWAYS make ONE pushback with a proof point before accepting. If timing language present, skip pushback and lock in future check-in: "are you against me booking something for [month]? That way it won\'t get lost."\n';
    userPrompt += '10. For Wrong Person: ask for warm intro. Do NOT repeat the pitch.\n';
    userPrompt += '11. Bull Bro CANNOT replace leads, schedule calendar events, or make phone calls. These actions go in ESCALATE only, never in RESPONSE.\n';
    userPrompt += '12. Below 80% confident: output ESCALATE: [reason] instead of a response.\n';
    userPrompt += '13. Removal/unsubscribe request: output BLOCK: removal request. No reply.\n';
    userPrompt += '14. OOO: output OOO: [return date]. No reply.\n';
    userPrompt += '15. ABSOLUTELY CRITICAL: RESPONSE must contain ONLY the clean email. No process notes, no reasoning, no "---", no "**PROCESS", no "NEXT ACTION", no analysis. The lead sees EVERY CHARACTER after RESPONSE:. End with signature line and NOTHING else.\n';
    userPrompt += '16. Output format:\n';
    userPrompt += 'CATEGORY: [category]\n';
    userPrompt += 'SMARTLEAD_STATUS: [status]\n';
    userPrompt += 'ESCALATE: [internal actions needed - OPTIONAL]\n';
    userPrompt += 'RESPONSE:\n[ONLY the clean email - nothing else]\n';

    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      var errText = await response.text();
      console.error('[SONNET] API error:', response.status, errText);
      return { type: 'ESCALATE', reason: 'Sonnet API error: ' + response.status };
    }

    var data = await response.json();
    var aiResponse = data.content[0].text;
    console.log('[SONNET] Raw response:', aiResponse.substring(0, 300));
    return parseAIResponse(aiResponse);
  } catch (err) {
    console.error('[SONNET] Error:', err.message);
    return { type: 'ESCALATE', reason: 'Sonnet error: ' + err.message };
  }
}

// ============================================================
// PARSE AI RESPONSE - with process notes stripping
// ============================================================

function parseAIResponse(aiResponse) {
  var text = aiResponse.trim();

  // Pure ESCALATE (no response)
  if (text.indexOf('ESCALATE:') === 0 && text.indexOf('RESPONSE:') < 0) {
    var reason = text.replace(/^ESCALATE:\s*/, '').trim();
    return { type: 'ESCALATE', reason: reason };
  }

  // BLOCK
  if (text.indexOf('BLOCK:') === 0 || (text.indexOf('BLOCK:') >= 0 && text.indexOf('RESPONSE:') < 0)) {
    var blockReason = text.replace(/.*BLOCK:\s*/s, '').trim();
    return { type: 'BLOCK', reason: blockReason };
  }

  // OOO
  if (text.indexOf('OOO:') === 0 || (text.indexOf('OOO:') >= 0 && text.indexOf('RESPONSE:') < 0)) {
    var info = text.replace(/.*OOO:\s*/s, '').trim();
    return { type: 'OOO', info: info };
  }

  // Structured response
  var categoryMatch = text.match(/CATEGORY:\s*(.+)/);
  var statusMatch = text.match(/SMARTLEAD_STATUS:\s*(.+)/);
  var escalateMatch = text.match(/ESCALATE:\s*(.+)/);
  var responseMatch = text.match(/RESPONSE:\s*([\s\S]+)/);

  if (!responseMatch) {
    return { type: 'ESCALATE', reason: 'Could not parse AI response format', rawResponse: text };
  }

  var cleanResponse = stripProcessNotes(responseMatch[1].trim());
  var escalationNote = escalateMatch ? escalateMatch[1].trim() : null;

  return {
    type: 'REPLY',
    category: categoryMatch ? categoryMatch[1].trim() : 'Unknown',
    smartleadStatus: statusMatch ? statusMatch[1].trim() : null,
    response: cleanResponse,
    escalationNote: escalationNote
  };
}

/**
 * Strip internal thinking, process notes, and commentary.
 * The lead must NEVER see anything after the signature or any internal markers.
 */
function stripProcessNotes(text) {
  if (!text) return '';
  var out = String(text);

  // Step 1: Cut at signature -- keep signature, drop everything after
  var signaturePatterns = [
    'Best,\nImman | @itssimannn',
    'Best,\nJan | @itssimannn',
    'Best, Imman | @itssimannn',
    'Best, Jan | @itssimannn',
    'Best,\nImman',
    'Best,\nJan',
    'Best, Imman',
    'Best, Jan'
  ];
  for (var i = 0; i < signaturePatterns.length; i++) {
    var sigIdx = out.indexOf(signaturePatterns[i]);
    if (sigIdx >= 0) {
      out = out.substring(0, sigIdx + signaturePatterns[i].length);
      break;
    }
  }

  // Step 2: Cut at internal note markers (safety net)
  var cutMarkers = [
    '\n---',
    '\n**PROCESS',
    '\n**INTERNAL',
    '\nPROCESS NOTE',
    '\nINTERNAL NOTE',
    '\n**Note:',
    '\n**NOTES:',
    '\n**REASONING:',
    '\n**ANALYSIS:',
    '\n**Logic:',
    '\n**Steps:',
    '\n**Action:',
    '\n**ACTION',
    '\n**NEXT ACTION',
    '\n**NEXT STEPS',
    '\nInternal note',
    '\n[Internal',
    '\n(Internal',
    '\nNEXT ACTION:',
    '\nACTION REQUIRED:',
    '\nESCALATION NEEDED:',
    '\nESCALATION:',
    '\n**Categorization:',
    '\n**Category:'
  ];
  for (var j = 0; j < cutMarkers.length; j++) {
    var markerIdx = out.indexOf(cutMarkers[j]);
    if (markerIdx >= 0) {
      out = out.substring(0, markerIdx);
    }
  }

  return out.trim();
}

// ============================================================
// MAIN PROCESSING LOGIC
// ============================================================

async function processAutoReply(task) {
  var payload = task.payload;
  var webhookReceivedAt = task.webhookReceivedAt;

  var leadEmail = payload.to_email || (payload.lead && payload.lead.email);
  var leadName = payload.to_name || ((payload.lead && payload.lead.first_name ? payload.lead.first_name : '') + ' ' + (payload.lead && payload.lead.last_name ? payload.lead.last_name : '')).trim();
  var leadCompany = (payload.lead && payload.lead.company_name) || extractCompanyFromEmail(leadEmail);
  var fromEmail = payload.from_email;
  var rawCampaignId = payload.campaign_id;
  var campaignId = rawCampaignId && !isNaN(rawCampaignId) ? String(rawCampaignId) : null;
  var campaignName = payload.campaign_name;
  var rawLeadId = payload.sl_email_lead_id || payload.stats_id || payload.lead_id;
  var leadId = rawLeadId && !isNaN(rawLeadId) ? String(rawLeadId) : null;
  var emailStatsId = payload.stats_id ? String(payload.stats_id) : null;
  var replyBody = (payload.reply_message && payload.reply_message.text) || payload.reply_body || payload.preview_text || (payload.reply && payload.reply.body) || '';
  var replyReceivedAt = payload.event_timestamp || payload.time_replied || (payload.reply_message && payload.reply_message.time);

  console.log('[PROCESS] Starting auto-reply for ' + leadEmail + ' (' + leadCompany + ')');

  if (!replyBody || replyBody.trim().length === 0) {
    console.log('[PROCESS] Empty reply body -- flagging for escalation');
    await sendEscalation('Empty reply from ' + leadName + ' (' + leadCompany + ') - ' + leadEmail + '. Webhook received but no email content.');
    return;
  }

  var delayMinutes = calculateDelay(replyReceivedAt, webhookReceivedAt);
  if (delayMinutes > 0) {
    console.log('[PROCESS] Waiting ' + delayMinutes.toFixed(1) + ' minutes before processing...');
    await new Promise(function(resolve) { setTimeout(resolve, delayMinutes * 60 * 1000); });
  }

  console.log('[PROCESS] Pulling full thread...');
  var fullThread = await getFullThread(campaignId, leadId);

  console.log('[PROCESS] Checking Calendly availability...');
  var availableSlots = await getAvailableSlots();

  console.log('[PROCESS] Generating response via Sonnet...');
  var aiResult = await generateResponse(
    leadName, leadCompany, leadEmail, fromEmail,
    replyBody, fullThread, availableSlots
  );

  console.log('[PROCESS] AI result type: ' + aiResult.type);

  switch (aiResult.type) {
    case 'ESCALATE':
      console.log('[PROCESS] ESCALATING: ' + aiResult.reason);
      await sendEscalation(
        '🚨 ESCALATION: ' + leadName + ' (' + leadCompany + ')\n' +
        'Email: ' + leadEmail + '\n' +
        'Reason: ' + aiResult.reason + '\n' +
        'Reply preview: ' + replyBody.substring(0, 200)
      );
      await updateDraftStatus(payload, aiResult, 'escalated');
      break;

    case 'BLOCK':
      console.log('[PROCESS] BLOCKING: ' + leadEmail);
      await sendEscalation(
        '🚫 BLOCKED: ' + leadName + ' (' + leadCompany + ')\n' +
        'Email: ' + leadEmail + '\n' +
        'Reason: ' + aiResult.reason
      );
      if (campaignId && leadId) {
        await updateLeadCategory(campaignId, leadId, 'Do Not Contact');
      }
      await updateDraftStatus(payload, aiResult, 'blocked');
      break;

    case 'OOO':
      console.log('[PROCESS] OOO detected: ' + aiResult.info);
      await sendSlackNotification({
        leadEmail: leadEmail, leadName: leadName, leadCompany: leadCompany, campaignName: campaignName,
        subcategory: 'out_of_office',
        replyPreview: 'OOO - ' + (aiResult.info || 'No return date')
      });
      await updateDraftStatus(payload, aiResult, 'ooo');
      break;

    case 'REPLY':
      console.log('[PROCESS] Generated reply (category: ' + aiResult.category + ') | Mode: ' + (AUTO_SEND_ENABLED ? 'AUTO-SEND' : 'DRAFT'));

      // Send escalation note to Slack separately if present
      if (aiResult.escalationNote) {
        await sendEscalation(
          '📋 ACTION NEEDED: ' + leadName + ' (' + leadCompany + ')\n' +
          'Email: ' + leadEmail + '\n' +
          'Action: ' + aiResult.escalationNote
        );
      }

      if (!AUTO_SEND_ENABLED) {
        console.log('[PROCESS] DRAFT MODE -- saving draft for ' + leadEmail);
        await sendSlackNotification({
          leadEmail: leadEmail, leadName: leadName, leadCompany: leadCompany, campaignName: campaignName,
          subcategory: aiResult.category.toLowerCase().replace(' ', '_'),
          replyPreview: '📝 DRAFT (not sent):\n\nLead said: "' + replyBody.substring(0, 200) + '"\n\nBull Bro drafted:\n' + aiResult.response
        });
        await updateDraftStatus(payload, aiResult, 'draft');

      } else {
        if (campaignId && emailStatsId) {
          var sent = await sendReply(campaignId, emailStatsId, aiResult.response);

          if (sent) {
            console.log('[PROCESS] Reply sent to ' + leadEmail);
            if (aiResult.smartleadStatus && campaignId && leadId) {
              await updateLeadCategory(campaignId, leadId, aiResult.smartleadStatus);
            }
            var positiveCategories = ['Interested', 'Information Request', 'Meeting Request', 'Booked'];
            if (positiveCategories.indexOf(aiResult.category) >= 0) {
              await sendSlackNotification({
                leadEmail: leadEmail, leadName: leadName, leadCompany: leadCompany, campaignName: campaignName,
                subcategory: aiResult.category.toLowerCase().replace(' ', '_'),
                replyPreview: '✅ Auto-replied:\n' + aiResult.response
              });
            }
            await updateDraftStatus(payload, aiResult, 'sent');
          } else {
            console.error('[PROCESS] Failed to send reply to ' + leadEmail);
            await sendEscalation(
              '⚠️ SEND FAILED: ' + leadName + ' (' + leadCompany + ')\n' +
              'Email: ' + leadEmail + '\n' +
              'Draft response was:\n' + aiResult.response + '\n' +
              'Please send manually.'
            );
            await updateDraftStatus(payload, aiResult, 'send_failed');
          }
        } else {
          console.error('[PROCESS] Missing campaignId or emailStatsId');
          await sendEscalation(
            '⚠️ MISSING IDS: ' + leadName + ' (' + leadCompany + ')\n' +
            'Email: ' + leadEmail + '\n' +
            'campaignId: ' + campaignId + ' | emailStatsId: ' + emailStatsId + '\n' +
            'Cannot send.\nDraft:\n' + aiResult.response
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
    var leadEmail = payload.to_email || (payload.lead && payload.lead.email);
    var replyBody = (payload.reply_message && payload.reply_message.text) || payload.reply_body || '';
    await supabase.from('smartlead_webhook_log').insert({
      event: 'AUTO_REPLY_PROCESSED',
      lead_email: leadEmail,
      lead_name: payload.to_name,
      lead_company: (payload.lead && payload.lead.company_name) || extractCompanyFromEmail(leadEmail),
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
// SLACK
// ============================================================

async function sendEscalation(message) {
  await sendSlackMessage(message);
}

async function sendSlackNotification(data) {
  try {
    var categoryEmoji = {
      'interested': '✨', 'meeting_request': '📅', 'info_request': '❓',
      'information_request': '❓', 'booked': '🎯', 'out_of_office': '🏖️',
      'not_interested': '👋', 'wrong_person': '🔄', 'do_not_contact': '🚫'
    };
    var emoji = categoryEmoji[data.subcategory] || '📬';
    var displayName = data.leadName || data.leadEmail;
    var displayCompany = data.leadCompany ? ' (' + data.leadCompany + ')' : '';

    var message = emoji + ' Bull Bro Auto-Reply\n\n' +
      displayName + displayCompany + '\n' +
      'Category: ' + data.subcategory.replace(/_/g, ' ') + '\n' +
      'Campaign: ' + (data.campaignName || 'Unknown') + '\n\n' +
      data.replyPreview;

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
    var response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    });
    if (!response.ok) {
      var errText = await response.text();
      console.error('[SLACK] Send failed:', errText);
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
  var emailTime = new Date(emailReceivedAt).getTime();
  var webhookTime = new Date(webhookReceivedAt).getTime();
  var alreadyDelayed = (webhookTime - emailTime) / 1000 / 60;
  var targetDelay = 2 + Math.random() * 2;
  if (alreadyDelayed >= targetDelay) return 0.5;
  return targetDelay - alreadyDelayed;
}

// ============================================================
// UTILITY
// ============================================================

function extractCompanyFromEmail(email) {
  if (!email) return null;
  var domain = email.split('@')[1];
  if (!domain) return null;
  var company = domain.split('.')[0];
  var genericDomains = ['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'aol', 'mail', 'protonmail', 'zoho'];
  if (genericDomains.indexOf(company.toLowerCase()) >= 0) return null;
  return company.charAt(0).toUpperCase() + company.slice(1);
}

// ============================================================
// WEBHOOK ENDPOINT
// ============================================================

async function handleWebhook(req, res) {
  var webhookReceivedAt = new Date().toISOString();
  var payload = req.body;
  var eventType = payload.event || payload.event_type;
  console.log('[WEBHOOK] Received ' + eventType + ' at ' + webhookReceivedAt);

  res.status(200).json({ status: 'received', timestamp: webhookReceivedAt });

  if (eventType !== 'EMAIL_REPLIED' && eventType !== 'EMAIL_REPLY') {
    console.log('[WEBHOOK] Ignoring event: ' + eventType);
    return;
  }

  var messageId = (payload.reply_message && payload.reply_message.message_id) || payload.message_id;
  if (isDuplicate(messageId)) return;

  try {
    var leadEmail = payload.to_email || (payload.lead && payload.lead.email);
    var leadName = payload.to_name;
    var replyBody = (payload.reply_message && payload.reply_message.text) || payload.reply_body || '';
    await supabase.from('smartlead_webhook_log').insert({
      event: eventType,
      campaign_id: payload.campaign_id ? String(payload.campaign_id) : null,
      campaign_name: payload.campaign_name,
      lead_id: (payload.sl_email_lead_id || payload.stats_id) ? String(payload.sl_email_lead_id || payload.stats_id) : null,
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

  enqueueResponse({ payload: payload, webhookReceivedAt: webhookReceivedAt });
}

async function handleTest(req, res) {
  res.json({
    status: 'ok',
    message: 'Bull Bro Auto-Reply is active',
    mode: AUTO_SEND_ENABLED ? 'AUTO-SEND (live)' : 'DRAFT (review only)',
    brainLoaded: SYSTEM_PROMPT.length > 0,
    brainSize: (SYSTEM_PROMPT.length / 1024).toFixed(1) + 'KB',
    queueLength: responseQueue.length,
    timestamp: new Date().toISOString()
  });
}

module.exports = { handleWebhook: handleWebhook, handleTest: handleTest };
