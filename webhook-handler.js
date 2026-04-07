#!/usr/bin/env node
/**
 * Webhook Handler for Real-Time Updates
 * 
 * Handles incoming webhooks from SmartLead for:
 * - New positive replies
 * - Lead status changes
 * - Meeting bookings
 */

require('dotenv').config();
const express = require('express');
const { initSupabase } = require('./lib/supabase');
const fs = require('fs');

const app = express();
app.use(express.json());

// Event log
const logEvent = (type, data) => {
  const logFile = 'webhook-events.log';
  const entry = `[${new Date().toISOString()}] ${type}: ${JSON.stringify(data)}\n`;
  fs.appendFileSync(logFile, entry);
  console.log(`📥 ${type}:`, data.email || data.lead_email || 'Unknown');
};

// Process new positive reply
async function handlePositiveReply(data) {
  const client = initSupabase();
  if (!client) return { success: false, error: 'DB not initialized' };

  try {
    // Check if lead exists
    const { data: existing } = await client
      .from('positive_replies')
      .select('id')
      .eq('lead_email', data.email)
      .single();

    if (existing) {
      // Update existing
      await client
        .from('positive_replies')
        .update({
          reply_category: data.category || 'Interested',
          replied_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      
      return { success: true, action: 'updated' };
    } else {
      // Insert new
      await client
        .from('positive_replies')
        .insert({
          lead_email: data.email,
          lead_name: data.name,
          lead_company: data.company,
          reply_category: data.category || 'Interested',
          replied_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        });
      
      return { success: true, action: 'created' };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Handle booking
async function handleBooking(data) {
  const client = initSupabase();
  if (!client) return { success: false, error: 'DB not initialized' };

  try {
    await client
      .from('positive_replies')
      .update({
        reply_category: 'Booked',
        booking_date: data.booking_date,
        updated_at: new Date().toISOString()
      })
      .eq('lead_email', data.email);

    return { success: true, action: 'booked' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Endpoints
app.post('/webhook/positive-reply', async (req, res) => {
  logEvent('positive-reply', req.body);
  const result = await handlePositiveReply(req.body);
  res.json(result);
});

app.post('/webhook/booking', async (req, res) => {
  logEvent('booking', req.body);
  const result = await handleBooking(req.body);
  res.json(result);
});

app.post('/webhook/lead-update', async (req, res) => {
  logEvent('lead-update', req.body);
  // Generic handler
  res.json({ success: true, received: true });
});

// Health check
app.get('/webhook/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Event stream for real-time dashboard updates
const clients = new Set();

app.get('/webhook/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  clients.add(res);
  
  req.on('close', () => {
    clients.delete(res);
  });
});

function broadcastEvent(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => client.write(message));
}

// Broadcast on new events
const originalLog = logEvent;
const logEventWithBroadcast = (type, data) => {
  originalLog(type, data);
  broadcastEvent(type, data);
};

const PORT = process.env.WEBHOOK_PORT || 3457;

if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n🪝 Webhook handler running on http://localhost:${PORT}`);
    console.log('');
    console.log('Endpoints:');
    console.log(`  POST /webhook/positive-reply`);
    console.log(`  POST /webhook/booking`);
    console.log(`  POST /webhook/lead-update`);
    console.log(`  GET  /webhook/events (SSE stream)`);
    console.log(`  GET  /webhook/health`);
    console.log('');
  });
}

module.exports = { app, handlePositiveReply, handleBooking };
