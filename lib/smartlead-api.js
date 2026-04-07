/**
 * SmartLead API Client
 * 
 * Complete integration with SmartLead's API
 * Based on working patterns from server.js
 */

require('dotenv').config();

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

class SmartLeadAPI {
  constructor(apiKey = API_KEY) {
    this.apiKey = apiKey;
  }

  /**
   * Make API request with retry logic
   */
  async request(endpoint, retries = 3) {
    const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${this.apiKey}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url);
        
        if (res.status === 502 || res.status === 503 || res.status === 429) {
          console.log(`API ${res.status}, retry ${attempt}/${retries}...`);
          await this.sleep(2000 * attempt);
          continue;
        }
        
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
        }
        
        return await res.json();
      } catch (error) {
        if (attempt === retries) throw error;
        await this.sleep(1000 * attempt);
      }
    }
  }

  /**
   * POST request
   */
  async post(endpoint, data, retries = 3) {
    const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${this.apiKey}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
        }
        
        return await res.json();
      } catch (error) {
        if (attempt === retries) throw error;
        await this.sleep(1000 * attempt);
      }
    }
  }

  // ==================== CAMPAIGNS ====================

  async getCampaigns() {
    return this.request('/campaigns/');
  }

  async getCampaign(campaignId) {
    return this.request(`/campaigns/${campaignId}`);
  }

  async getCampaignSequences(campaignId) {
    return this.request(`/campaigns/${campaignId}/sequences`);
  }

  async getCampaignStats(campaignId) {
    return this.request(`/campaigns/${campaignId}`);
  }

  async getCampaignLeads(campaignId, offset = 0, limit = 100) {
    return this.request(`/campaigns/${campaignId}/leads?offset=${offset}&limit=${limit}`);
  }

  // ==================== LEADS ====================

  async getLeadMessages(campaignId, leadId) {
    return this.request(`/campaigns/${campaignId}/leads/${leadId}/message-history`);
  }

  async getLeadByEmail(campaignId, email) {
    const leads = await this.getCampaignLeads(campaignId, 0, 1000);
    return (leads || []).find(l => l.email === email);
  }

  // ==================== EMAIL ACCOUNTS ====================

  async getEmailAccounts() {
    return this.request('/email-accounts/');
  }

  async getEmailAccountStats(accountId) {
    return this.request(`/email-accounts/${accountId}`);
  }

  // ==================== REPLIES ====================

  async getAllReplies(campaignId) {
    return this.request(`/campaigns/${campaignId}/replies`);
  }

  // ==================== GLOBAL STATS ====================

  async getGlobalStats(startDate, endDate) {
    return this.request(`/client/stats?start_date=${startDate}&end_date=${endDate}`);
  }

  async getMonthlyStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    return this.getGlobalStats(startOfMonth, endOfMonth);
  }

  // ==================== UTILITY ====================

  async checkHealth() {
    try {
      const campaigns = await this.getCampaigns();
      return {
        status: 'ok',
        campaignCount: Array.isArray(campaigns) ? campaigns.length : (campaigns?.length || 0),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { SmartLeadAPI };
