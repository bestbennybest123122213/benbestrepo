#!/usr/bin/env node
/**
 * Smartlead Webhook Receiver
 * Receives Smartlead webhooks and logs new replies.
 *
 * Usage:
 *   node smartlead-webhook.js
 */

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.WEBHOOK_PORT || 3457;
const EVENTS_FILE = path.join(__dirname, 'data', 'webhook-events.json');

function loadEvents() {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading webhook events:', e.message);
  }
  return [];
}

function saveEvents(events) {
  const dir = path.dirname(EVENTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

function isNewReply(event) {
  const type = (event.event_type || event.type || '').toLowerCase();
  return ['reply', 'email_reply', 'lead_replied', 'new_reply'].includes(type);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/webhook', (req, res) => {
  const payload = req.body || {};
  const eventType = payload.event_type || payload.type || 'unknown';
  const receivedAt = new Date().toISOString();

  if (isNewReply(payload)) {
    const leadEmail = payload.lead_email || payload.email || payload.from || null;
    const replyText = payload.reply_text || payload.body || payload.text || '';

    console.log(`[${receivedAt}] New reply from ${leadEmail || 'unknown'} (${eventType})`);

    const events = loadEvents();
    events.push({
      received_at: receivedAt,
      event_type: eventType,
      lead_email: leadEmail,
      reply_text: replyText,
      payload
    });
    saveEvents(events);
  } else {
    console.log(`[${receivedAt}] Webhook received (${eventType})`);
  }

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`✅ Smartlead webhook server listening on port ${PORT}`);
  console.log('POST /webhook  |  GET /health');
});
