/**
 * SmartLead Actions - Block leads, send replies
 * CURRENTLY: Block function only. Send is manual.
 */

const API_KEY = process.env.SMARTLEAD_API_KEY;
const BASE_URL = 'https://server.smartlead.ai/api/v1';

/**
 * Block a lead in SmartLead (add to global block list)
 */
async function blockLead(email) {
  try {
    const response = await fetch(`${BASE_URL}/leads/${encodeURIComponent(email)}/block?api_key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ Blocked: ${email}`);
      return { success: true, email };
    } else {
      console.log(`❌ Failed to block ${email}:`, data);
      return { success: false, email, error: data };
    }
  } catch (err) {
    console.error(`Error blocking ${email}:`, err.message);
    return { success: false, email, error: err.message };
  }
}

/**
 * Update lead category in a campaign
 */
async function updateLeadCategory(campaignId, leadEmail, categoryId) {
  try {
    const response = await fetch(`${BASE_URL}/campaigns/${campaignId}/leads?api_key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_email: leadEmail,
        lead_category_id: categoryId
      })
    });
    
    const data = await response.json();
    return { success: response.ok, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get lead categories
 */
async function getCategories() {
  try {
    const response = await fetch(`${BASE_URL}/leads/categories?api_key=${API_KEY}`);
    return await response.json();
  } catch (err) {
    console.error('Error fetching categories:', err.message);
    return [];
  }
}

module.exports = {
  blockLead,
  updateLeadCategory,
  getCategories,
  API_KEY,
  BASE_URL
};
