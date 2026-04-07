/**
 * Quick Actions API
 * 
 * One-click actions for lead management:
 * - Mark as Booked
 * - Send Follow-up
 * - Mark as Not Interested
 * - Snooze (delay follow-up)
 * - Add Note
 */

const { initSupabase } = require('./supabase');
const { SmartLeadAPI } = require('./smartlead-api');

class QuickActions {
  constructor() {
    this.supabase = initSupabase();
    this.api = new SmartLeadAPI();
  }

  /**
   * Mark lead as booked
   */
  async markBooked(email, meetingDate = null) {
    const { error } = await this.supabase
      .from('positive_replies')
      .update({
        reply_category: 'Booked',
        meeting_date: meetingDate,
        updated_at: new Date().toISOString()
      })
      .eq('lead_email', email);

    if (error) throw new Error(error.message);

    return { 
      success: true, 
      action: 'marked_booked',
      email,
      meetingDate
    };
  }

  /**
   * Mark lead as not interested
   */
  async markNotInterested(email, reason = null) {
    const { error } = await this.supabase
      .from('positive_replies')
      .update({
        reply_category: 'Not Interested',
        notes: reason ? `Not interested: ${reason}` : null,
        updated_at: new Date().toISOString()
      })
      .eq('lead_email', email);

    if (error) throw new Error(error.message);

    return { 
      success: true, 
      action: 'marked_not_interested',
      email
    };
  }

  /**
   * Snooze lead (delay follow-up)
   */
  async snooze(email, days = 3) {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + days);

    const { error } = await this.supabase
      .from('positive_replies')
      .update({
        snoozed_until: snoozeUntil.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('lead_email', email);

    if (error) throw new Error(error.message);

    return { 
      success: true, 
      action: 'snoozed',
      email,
      until: snoozeUntil.toISOString()
    };
  }

  /**
   * Add note to lead
   */
  async addNote(email, note) {
    // Get existing notes
    const { data: lead } = await this.supabase
      .from('positive_replies')
      .select('notes')
      .eq('lead_email', email)
      .single();

    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const newNote = `[${timestamp}] ${note}`;
    const existingNotes = lead?.notes || '';
    const allNotes = existingNotes ? `${existingNotes}\n${newNote}` : newNote;

    const { error } = await this.supabase
      .from('positive_replies')
      .update({
        notes: allNotes,
        updated_at: new Date().toISOString()
      })
      .eq('lead_email', email);

    if (error) throw new Error(error.message);

    return { 
      success: true, 
      action: 'note_added',
      email,
      note
    };
  }

  /**
   * Update category
   */
  async updateCategory(email, category) {
    const validCategories = [
      'Meeting Request', 
      'Interested', 
      'Information Request', 
      'Booked',
      'Not Interested',
      'Out of Office'
    ];

    if (!validCategories.includes(category)) {
      throw new Error(`Invalid category: ${category}`);
    }

    const { error } = await this.supabase
      .from('positive_replies')
      .update({
        reply_category: category,
        updated_at: new Date().toISOString()
      })
      .eq('lead_email', email);

    if (error) throw new Error(error.message);

    return { 
      success: true, 
      action: 'category_updated',
      email,
      category
    };
  }

  /**
   * Get lead with full context
   */
  async getLeadContext(email) {
    const { data: lead, error } = await this.supabase
      .from('positive_replies')
      .select('*')
      .eq('lead_email', email)
      .single();

    if (error) throw new Error(error.message);

    // Calculate age
    const age = lead.replied_at 
      ? Math.floor((Date.now() - new Date(lead.replied_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      ...lead,
      age,
      isStale: age > 14,
      isHot: age <= 3,
      needsAction: ['Meeting Request', 'Interested'].includes(lead.reply_category) && age <= 7
    };
  }

  /**
   * Bulk action
   */
  async bulkAction(emails, action, params = {}) {
    const results = [];
    
    for (const email of emails) {
      try {
        let result;
        switch (action) {
          case 'mark_booked':
            result = await this.markBooked(email, params.meetingDate);
            break;
          case 'mark_not_interested':
            result = await this.markNotInterested(email, params.reason);
            break;
          case 'snooze':
            result = await this.snooze(email, params.days || 3);
            break;
          case 'update_category':
            result = await this.updateCategory(email, params.category);
            break;
          default:
            result = { success: false, error: 'Unknown action' };
        }
        results.push({ email, ...result });
      } catch (error) {
        results.push({ email, success: false, error: error.message });
      }
    }

    return {
      success: results.every(r => r.success),
      total: emails.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }
}

module.exports = { QuickActions };
