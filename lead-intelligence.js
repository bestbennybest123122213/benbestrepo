/**
 * Lead Intelligence Module
 * Enriches leads with company info, timezone, industry
 */

const { Client } = require('pg');

// Timezone mapping by country TLD and common domains
const TIMEZONE_MAP = {
  // Country TLDs
  '.uk': 'Europe/London',
  '.de': 'Europe/Berlin',
  '.fr': 'Europe/Paris',
  '.es': 'Europe/Madrid',
  '.it': 'Europe/Rome',
  '.nl': 'Europe/Amsterdam',
  '.pl': 'Europe/Warsaw',
  '.jp': 'Asia/Tokyo',
  '.cn': 'Asia/Shanghai',
  '.kr': 'Asia/Seoul',
  '.au': 'Australia/Sydney',
  '.nz': 'Pacific/Auckland',
  '.in': 'Asia/Kolkata',
  '.sg': 'Asia/Singapore',
  '.br': 'America/Sao_Paulo',
  '.mx': 'America/Mexico_City',
  '.ca': 'America/Toronto',
  // Default to US Eastern for .com/.org/.io
};

// Industry detection by domain keywords and known companies
const INDUSTRY_KEYWORDS = {
  gaming: ['game', 'gaming', 'play', 'studio', 'esport', 'gameloft', 'rovio', 'supercell', 'zynga', 'ea.com', 'ubisoft', 'activision', 'riot'],
  fintech: ['bank', 'finance', 'pay', 'money', 'capital', 'invest', 'trading', 'crypto', 'wallet'],
  edtech: ['edu', 'learn', 'school', 'academy', 'course', 'training', 'tutor'],
  healthtech: ['health', 'medical', 'pharma', 'clinic', 'care', 'wellness', 'fitness'],
  ecommerce: ['shop', 'store', 'buy', 'retail', 'commerce', 'market'],
  saas: ['cloud', 'software', 'app', 'platform', 'tool', 'service', 'tech'],
  media: ['media', 'news', 'content', 'publish', 'entertainment', 'video', 'stream'],
  agency: ['agency', 'marketing', 'creative', 'digital', 'brand', 'consulting']
};

// Company size indicators
const SIZE_INDICATORS = {
  enterprise: ['inc', 'corp', 'corporation', 'group', 'holdings', 'international'],
  startup: ['io', 'co', 'app', 'labs', 'ventures']
};

/**
 * Get database connection
 */
function getDb() {
  return new Client({
    host: 'db.rwhqshjmngkyremwandx.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'HUWCP0mlzUiTQqMo',
    ssl: { rejectUnauthorized: false }
  });
}

/**
 * Extract domain from email
 */
function extractDomain(email) {
  if (!email) return null;
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase() : null;
}

/**
 * Detect timezone from domain
 */
function detectTimezone(domain, companyName) {
  if (!domain) return 'America/New_York'; // Default to ET
  
  // Check country TLDs
  for (const [tld, tz] of Object.entries(TIMEZONE_MAP)) {
    if (domain.endsWith(tld)) return tz;
  }
  
  // Check for country indicators in domain
  if (domain.includes('.co.uk')) return 'Europe/London';
  if (domain.includes('.com.au')) return 'Australia/Sydney';
  if (domain.includes('.co.jp')) return 'Asia/Tokyo';
  
  // Default to US Eastern for .com/.org/.io etc
  return 'America/New_York';
}

/**
 * Detect industry from domain and company name
 */
function detectIndustry(domain, companyName) {
  const text = `${domain || ''} ${companyName || ''}`.toLowerCase();
  
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) return industry;
    }
  }
  
  return 'other';
}

/**
 * Estimate company size from domain/name
 */
function estimateCompanySize(domain, companyName) {
  const text = `${domain || ''} ${companyName || ''}`.toLowerCase();
  
  // Enterprise indicators
  for (const word of SIZE_INDICATORS.enterprise) {
    if (text.includes(word)) return 'enterprise';
  }
  
  // Startup indicators
  for (const word of SIZE_INDICATORS.startup) {
    if (text.includes(word)) return 'startup';
  }
  
  return 'unknown';
}

/**
 * Enrich a lead with intelligence data
 */
async function enrichLead(email, companyName) {
  const domain = extractDomain(email);
  
  const enrichment = {
    email,
    domain,
    company_name: companyName,
    timezone: detectTimezone(domain, companyName),
    industry: detectIndustry(domain, companyName),
    company_size: estimateCompanySize(domain, companyName),
    funding: null, // Would need external API
    linkedin_url: null, // Would need external API
    country: null
  };
  
  // Try to get cached enrichment first
  const db = getDb();
  await db.connect();
  
  try {
    // Check cache
    const cached = await db.query(
      'SELECT * FROM lead_enrichment_cache WHERE email = $1',
      [email]
    );
    
    if (cached.rows.length > 0) {
      await db.end();
      return cached.rows[0];
    }
    
    // Cache new enrichment
    await db.query(`
      INSERT INTO lead_enrichment_cache 
      (email, domain, company_name, industry, company_size, timezone)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        industry = EXCLUDED.industry,
        company_size = EXCLUDED.company_size,
        timezone = EXCLUDED.timezone,
        enriched_at = NOW()
    `, [
      email,
      domain,
      companyName,
      enrichment.industry,
      enrichment.company_size,
      enrichment.timezone
    ]);
    
    await db.end();
    return enrichment;
    
  } catch (err) {
    await db.end();
    console.error('Enrichment error:', err.message);
    return enrichment;
  }
}

/**
 * Get or create email thread for a lead
 */
async function getOrCreateThread(leadEmail, campaignId) {
  const db = getDb();
  await db.connect();
  
  try {
    // Check for existing thread
    let result = await db.query(
      'SELECT * FROM email_threads WHERE lead_email = $1 AND campaign_id = $2',
      [leadEmail, campaignId]
    );
    
    if (result.rows.length > 0) {
      await db.end();
      return result.rows[0];
    }
    
    // Create new thread
    result = await db.query(`
      INSERT INTO email_threads (lead_email, campaign_id, message_count, first_contact_at)
      VALUES ($1, $2, 0, NOW())
      RETURNING *
    `, [leadEmail, campaignId]);
    
    await db.end();
    return result.rows[0];
    
  } catch (err) {
    await db.end();
    console.error('Thread error:', err.message);
    return null;
  }
}

/**
 * Add message to thread and update count
 */
async function addMessageToThread(threadId, message, type = 'reply') {
  const db = getDb();
  await db.connect();
  
  try {
    await db.query(`
      UPDATE email_threads 
      SET 
        message_count = message_count + 1,
        messages = messages || $1::jsonb,
        last_reply_at = CASE WHEN $2 = 'reply' THEN NOW() ELSE last_reply_at END,
        our_last_send_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE our_last_send_at END
      WHERE id = $3
    `, [
      JSON.stringify([{ type, text: message.substring(0, 500), at: new Date().toISOString() }]),
      type,
      threadId
    ]);
    
    await db.end();
    return true;
  } catch (err) {
    await db.end();
    console.error('Add message error:', err.message);
    return false;
  }
}

/**
 * Check for duplicate leads (same domain, similar name)
 */
async function checkForDuplicate(email, companyName) {
  const domain = extractDomain(email);
  if (!domain) return null;
  
  const db = getDb();
  await db.connect();
  
  try {
    // Check for other leads from same domain
    const result = await db.query(`
      SELECT id, lead_email, lead_name, lead_company, created_at
      FROM smartlead_reply_drafts
      WHERE lead_email LIKE $1
      AND lead_email != $2
      AND status NOT IN ('blocked', 'skipped')
      ORDER BY created_at DESC
      LIMIT 5
    `, [`%@${domain}`, email]);
    
    await db.end();
    
    if (result.rows.length > 0) {
      return {
        isDuplicate: true,
        relatedLeads: result.rows
      };
    }
    
    return { isDuplicate: false, relatedLeads: [] };
    
  } catch (err) {
    await db.end();
    console.error('Duplicate check error:', err.message);
    return { isDuplicate: false, relatedLeads: [] };
  }
}

/**
 * Calculate urgency score (0-100)
 */
function calculateUrgency(classification, threadCount, replyTimestamp) {
  let score = 0;
  
  // Category score
  if (classification.category === 'POSITIVE') {
    if (classification.subcategory === 'meeting_request') score += 50;
    else if (classification.subcategory === 'interested') score += 40;
  } else if (classification.category === 'NEUTRAL') {
    if (classification.subcategory === 'question') score += 20;
  }
  
  // Thread depth bonus (engaged leads)
  score += Math.min(threadCount * 5, 20);
  
  // Reply speed bonus (replied within 1 hour of our send)
  if (replyTimestamp) {
    const hoursSinceReply = (Date.now() - new Date(replyTimestamp).getTime()) / (1000 * 60 * 60);
    if (hoursSinceReply < 1) score += 20;
    else if (hoursSinceReply < 4) score += 10;
  }
  
  return Math.min(score, 100);
}

module.exports = {
  enrichLead,
  getOrCreateThread,
  addMessageToThread,
  checkForDuplicate,
  calculateUrgency,
  extractDomain,
  detectTimezone,
  detectIndustry
};
