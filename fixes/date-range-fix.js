// Date Range Fix for SmartLead API
// 
// PROBLEM: SmartLead's "Last 30 Days" in Global Analytics means:
// - From (today - 29 days) to today (inclusive)
// - This gives exactly 30 calendar days of data
//
// Our current calculation:
// - new Date(now - 30 * 24 * 60 * 60 * 1000)
// - This gives 31 calendar days (off by 1)
//
// FIX: Use (N-1) days for "Last N Days" to match SmartLead

// Helper function to calculate SmartLead-compatible date ranges
function getSmartLeadDateRange(days) {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  // SmartLead: "Last 30 days" means 29 days back + today = 30 days total
  const start = new Date(now - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { start, end };
}

// Test cases for March 13, 2026:
// Last 30 days: Feb 13 - Mar 13 (30 days inclusive)
// Last 90 days: Dec 14 - Mar 13 (90 days inclusive)
// Last 120 days: Nov 14 - Mar 13 (120 days inclusive)

console.log('Date Range Test (assuming today is Mar 13, 2026):');
console.log('Last 30 days:', getSmartLeadDateRange(30));
console.log('Last 90 days:', getSmartLeadDateRange(90));
console.log('Last 120 days:', getSmartLeadDateRange(120));
