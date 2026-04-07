/**
 * WebSocket Handler
 * 
 * Real-time updates for the dashboard:
 * - New leads
 * - Status changes
 * - Live metrics
 */

const WebSocket = require('ws');

class WebSocketHandler {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    this.clients = new Set();
    
    this.wss.on('connection', (ws, req) => {
      console.log('[WS] Client connected');
      this.clients.add(ws);
      
      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString()
      }));
      
      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        this.clients.delete(ws);
      });
      
      ws.on('error', (err) => {
        console.error('[WS] Error:', err.message);
        this.clients.delete(ws);
      });
      
      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data);
          this.handleMessage(ws, msg);
        } catch (e) {
          console.error('[WS] Invalid message:', e.message);
        }
      });
    });
    
    console.log('[WS] WebSocket server initialized on /ws');
  }
  
  handleMessage(ws, msg) {
    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      case 'subscribe':
        // Could add channel subscriptions
        break;
    }
  }
  
  broadcast(message) {
    const payload = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (e) {
          this.clients.delete(client);
        }
      }
    });
  }
  
  // Specific broadcast methods
  broadcastNewLead(lead) {
    this.broadcast({
      type: 'new_lead',
      data: lead,
      timestamp: new Date().toISOString()
    });
  }
  
  broadcastStatusChange(email, oldStatus, newStatus) {
    this.broadcast({
      type: 'status_change',
      data: { email, oldStatus, newStatus },
      timestamp: new Date().toISOString()
    });
  }
  
  broadcastMetrics(metrics) {
    this.broadcast({
      type: 'metrics_update',
      data: metrics,
      timestamp: new Date().toISOString()
    });
  }
  
  getClientCount() {
    return this.clients.size;
  }
}

module.exports = { WebSocketHandler };
