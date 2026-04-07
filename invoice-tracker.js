#!/usr/bin/env node
/**
 * Invoice Tracker
 * Track invoices, due dates, and payment status
 *
 * Usage:
 *   node invoice-tracker.js add "Company" 25000 2026-02-28
 *   node invoice-tracker.js list
 *   node invoice-tracker.js paid <id>
 *   node invoice-tracker.js overdue
 *   node invoice-tracker.js summary
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const INVOICES_FILE = path.join(__dirname, 'data', 'invoices.json');
const VALID_STATUSES = new Set(['pending', 'paid', 'overdue']);

function loadInvoices() {
  try {
    if (fs.existsSync(INVOICES_FILE)) {
      return JSON.parse(fs.readFileSync(INVOICES_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading invoices:', e.message);
  }
  return { invoices: [], lastId: 0 };
}

function saveInvoices(data) {
  const dir = path.dirname(INVOICES_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(INVOICES_FILE, JSON.stringify(data, null, 2));
}

function formatCurrency(amount) {
  return '$' + Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

function normalizeStatus(status) {
  if (!status) return 'pending';
  const lower = status.toLowerCase();
  return VALID_STATUSES.has(lower) ? lower : 'pending';
}

function addInvoice(company, amount, dueDate, status) {
  if (!company || !amount || !dueDate) {
    console.log('Usage: node invoice-tracker.js add "Company" 25000 2026-02-28 [status]');
    process.exit(1);
  }

  const data = loadInvoices();
  data.lastId += 1;

  const invoice = {
    id: data.lastId,
    company,
    amount: parseFloat(amount),
    status: normalizeStatus(status),
    due_date: dueDate,
    paid_date: null,
    created_at: new Date().toISOString()
  };

  if (invoice.status === 'paid') {
    invoice.paid_date = new Date().toISOString().split('T')[0];
  }

  data.invoices.push(invoice);
  saveInvoices(data);

  console.log(`✅ Added invoice #${invoice.id}: ${company} (${formatCurrency(invoice.amount)})`);
}

function listInvoices() {
  const data = loadInvoices();

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🧾 INVOICE TRACKER                                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (data.invoices.length === 0) {
    console.log('No invoices recorded yet.');
    console.log('Add one with: node invoice-tracker.js add "Company" 25000 2026-02-28\n');
    return;
  }

  console.log('ID   Company               Amount        Status     Due Date           Paid Date');
  console.log('─'.repeat(90));

  data.invoices.forEach(inv => {
    console.log(
      `${String(inv.id).padEnd(4)} ` +
      `${inv.company.substring(0, 20).padEnd(20)} ` +
      `${formatCurrency(inv.amount).padEnd(13)} ` +
      `${inv.status.padEnd(9)} ` +
      `${formatDate(inv.due_date).padEnd(17)} ` +
      `${formatDate(inv.paid_date)}`
    );
  });
  console.log('');
}

function markPaid(id) {
  const data = loadInvoices();
  const invoice = data.invoices.find(i => i.id === parseInt(id, 10));

  if (!invoice) {
    console.error(`Invoice #${id} not found.`);
    process.exit(1);
  }

  invoice.status = 'paid';
  invoice.paid_date = new Date().toISOString().split('T')[0];
  saveInvoices(data);

  console.log(`✅ Marked invoice #${invoice.id} as paid.`);
}

function listOverdue() {
  const data = loadInvoices();
  const today = new Date();

  const overdue = data.invoices.filter(inv => {
    if (inv.status === 'paid') return false;
    const due = new Date(inv.due_date);
    if (Number.isNaN(due.getTime())) return false;
    return due < today;
  }).map(inv => ({
    ...inv,
    days_overdue: Math.abs(daysUntil(inv.due_date))
  }));

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  ⏰ OVERDUE INVOICES                                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  if (overdue.length === 0) {
    console.log('✅ No overdue invoices.\n');
    return;
  }

  overdue.sort((a, b) => b.days_overdue - a.days_overdue);

  console.log('ID   Company               Amount        Days Overdue    Due Date');
  console.log('─'.repeat(80));

  overdue.forEach(inv => {
    console.log(
      `${String(inv.id).padEnd(4)} ` +
      `${inv.company.substring(0, 20).padEnd(20)} ` +
      `${formatCurrency(inv.amount).padEnd(13)} ` +
      `${String(inv.days_overdue).padStart(6).padEnd(14)} ` +
      `${formatDate(inv.due_date)}`
    );
  });
  console.log('');
}

function showSummary() {
  const data = loadInvoices();
  const now = new Date();

  const totals = {
    pending: 0,
    paid: 0,
    overdue: 0
  };

  data.invoices.forEach(inv => {
    const amount = Number(inv.amount || 0);
    if (inv.status === 'paid') {
      totals.paid += amount;
    } else {
      const due = new Date(inv.due_date);
      if (!Number.isNaN(due.getTime()) && due < now) {
        totals.overdue += amount;
      } else {
        totals.pending += amount;
      }
    }
  });

  console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║  📊 INVOICE SUMMARY                                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  console.log(`  Pending: ${formatCurrency(totals.pending)}`);
  console.log(`  Overdue: ${formatCurrency(totals.overdue)}`);
  console.log(`  Paid:    ${formatCurrency(totals.paid)}`);
  console.log('');
}

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'add':
    addInvoice(args[1], args[2], args[3], args[4]);
    break;
  case 'list':
    listInvoices();
    break;
  case 'paid':
    markPaid(args[1]);
    break;
  case 'overdue':
    listOverdue();
    break;
  case 'summary':
    showSummary();
    break;
  default:
    listInvoices();
    break;
}
