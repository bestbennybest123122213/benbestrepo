/**
 * GEX Utilities Library
 * 
 * Shared helper functions used across multiple scripts.
 * Import with: const { formatDate, getAgeDays, ... } = require('./lib/utils');
 */

// ═══════════════════════════════════════════════════════════════════════════
// Date & Time Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the age of a date in days
 */
function getAgeDays(dateStr) {
  if (!dateStr) return 999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60 * 24));
}

/**
 * Get the age of a date in hours
 */
function getAgeHours(dateStr) {
  if (!dateStr) return 99999;
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now - date) / (1000 * 60 * 60));
}

/**
 * Format a date as a human-readable relative time
 */
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Format a date for display
 */
function formatDate(dateStr, format = 'short') {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  
  if (format === 'short') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } else if (format === 'long') {
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
    });
  } else if (format === 'iso') {
    return date.toISOString().split('T')[0];
  }
  return date.toLocaleDateString();
}

/**
 * Get today's date in ISO format
 */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════════════════
// Text Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Truncate text to a max length with ellipsis
 */
function truncate(text, maxLength = 30) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Format a number with commas
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString();
}

/**
 * Format as currency
 */
function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined) return '$0';
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency,
    minimumFractionDigits: 0 
  }).format(amount);
}

/**
 * Format a percentage
 */
function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined) return '0%';
  return `${value.toFixed(decimals)}%`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Lead Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get company name from email domain
 */
function getCompanyFromEmail(email) {
  if (!email) return 'Unknown';
  const domain = email.split('@')[1];
  if (!domain) return 'Unknown';
  
  // Remove common TLDs and format nicely
  const name = domain.split('.')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Classify lead urgency based on age
 */
function classifyUrgency(ageDays) {
  if (ageDays <= 1) return { level: 'critical', emoji: '🔥', label: 'Critical' };
  if (ageDays <= 3) return { level: 'high', emoji: '⚠️', label: 'High' };
  if (ageDays <= 7) return { level: 'medium', emoji: '📌', label: 'Medium' };
  if (ageDays <= 14) return { level: 'low', emoji: '📋', label: 'Low' };
  return { level: 'stale', emoji: '💤', label: 'Stale' };
}

/**
 * Get emoji for lead category
 */
function getCategoryEmoji(category) {
  const emojis = {
    'Booked': '✅',
    'Meeting Request': '📅',
    'Interested': '👍',
    'Question': '❓',
    'Referral': '👥',
    'Not Interested': '❌',
    'Later': '⏰',
    'OOO': '🏖️',
    'Positive': '👍',
    'Neutral': '😐',
    'Negative': '👎'
  };
  return emojis[category] || '📧';
}

// ═══════════════════════════════════════════════════════════════════════════
// Output Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a progress bar string
 */
function progressBar(current, total, width = 20) {
  if (total === 0) return '░'.repeat(width);
  const percent = Math.min(current / total, 1);
  const filled = Math.round(width * percent);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Color a number based on whether it's good or bad
 * Returns ANSI color codes for terminal output
 */
function colorNumber(value, thresholds = { good: 50, warn: 25 }) {
  const colors = {
    good: '\x1b[32m',   // Green
    warn: '\x1b[33m',   // Yellow
    bad: '\x1b[31m',    // Red
    reset: '\x1b[0m'
  };
  
  if (value >= thresholds.good) return `${colors.good}${value}${colors.reset}`;
  if (value >= thresholds.warn) return `${colors.warn}${value}${colors.reset}`;
  return `${colors.bad}${value}${colors.reset}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation Utilities
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a string is a valid email
 */
function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Ensure a value is within bounds
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// ═══════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  // Date utilities
  getAgeDays,
  getAgeHours,
  timeAgo,
  formatDate,
  todayISO,
  
  // Text utilities
  truncate,
  escapeHtml,
  formatNumber,
  formatCurrency,
  formatPercent,
  
  // Lead utilities
  getCompanyFromEmail,
  classifyUrgency,
  getCategoryEmoji,
  
  // Output utilities
  progressBar,
  colorNumber,
  
  // Validation
  isValidEmail,
  clamp
};
