#!/usr/bin/env node
/**
 * Email Infrastructure Pricing Calculator
 * 
 * Compare Zapmail + Dynadot (DIY) vs SmartLead pricing
 * 
 * Usage:
 *   node pricing-calculator.js                    # Default 400 mailboxes
 *   node pricing-calculator.js --mailboxes 500   # Custom mailbox count
 *   node pricing-calculator.js --months 24       # 2-year projection
 *   node pricing-calculator.js --telegram        # Telegram format
 */

const args = process.argv.slice(2);

// Parse arguments
const getArg = (name, defaultVal) => {
  const idx = args.indexOf(`--${name}`);
  return idx > -1 && args[idx + 1] ? parseFloat(args[idx + 1]) : defaultVal;
};

const mailboxes = getArg('mailboxes', 400);
const months = getArg('months', 12);
const telegram = args.includes('--telegram');

// ═══════════════════════════════════════════════════════════════
// PRICING CONFIGURATION (Update these when prices change)
// ═══════════════════════════════════════════════════════════════

const ZAPMAIL = {
  name: 'Zapmail + Dynadot (DIY)',
  // Base platform fee
  baseMonthly: 299,
  baseQuarterly: 270,  // if paid quarterly
  affiliateDiscount: 0.10,  // 10% off with affiliate
  // Per mailbox
  perMailboxSetup: 30,  // One-time setup per mailbox
  perMailboxMonthly: 0, // Assuming $30 is one-time (needs confirmation)
  // Domains
  domainPrice: 3,  // .info domains from Dynadot
  accountsPerDomain: 12,
};

const SMARTLEAD = {
  name: 'SmartLead',
  // Per mailbox
  perMailboxMonthly: 4.50,
  discountAfterMonth: 2,  // Discount kicks in after month 2
  discount: 0.15,  // 15% discount
  // Domains
  domainPrice: 13,  // .com domains
  accountsPerDomain: 12,
};

// ═══════════════════════════════════════════════════════════════
// CALCULATIONS
// ═══════════════════════════════════════════════════════════════

function calculateZapmail(mailboxes, months) {
  const domainsNeeded = Math.ceil(mailboxes / ZAPMAIL.accountsPerDomain);
  
  // One-time costs
  const domainCost = domainsNeeded * ZAPMAIL.domainPrice;
  const mailboxSetup = mailboxes * ZAPMAIL.perMailboxSetup;
  const oneTime = domainCost + mailboxSetup;
  
  // Monthly costs (with quarterly + affiliate discount)
  const bestMonthly = ZAPMAIL.baseQuarterly * (1 - ZAPMAIL.affiliateDiscount);
  const monthlyTotal = bestMonthly + (mailboxes * ZAPMAIL.perMailboxMonthly);
  
  // Projection
  const yearOne = oneTime + (monthlyTotal * Math.min(months, 12));
  const yearTwo = months > 12 ? monthlyTotal * (months - 12) : 0;
  const total = yearOne + yearTwo;
  
  return {
    name: ZAPMAIL.name,
    oneTime: {
      domains: domainCost,
      mailboxSetup: mailboxSetup,
      total: oneTime
    },
    monthly: {
      base: bestMonthly,
      perMailbox: ZAPMAIL.perMailboxMonthly,
      total: monthlyTotal
    },
    projection: {
      months,
      total,
      perMonth: total / months
    },
    notes: [
      `${domainsNeeded} .info domains @ $${ZAPMAIL.domainPrice}`,
      `$30/mailbox one-time setup`,
      `Quarterly billing + 10% affiliate discount applied`,
    ]
  };
}

function calculateSmartLead(mailboxes, months) {
  const domainsNeeded = Math.ceil(mailboxes / SMARTLEAD.accountsPerDomain);
  
  // One-time costs
  const domainCost = domainsNeeded * SMARTLEAD.domainPrice;
  const oneTime = domainCost;
  
  // Monthly costs
  const fullPriceMonthly = mailboxes * SMARTLEAD.perMailboxMonthly;
  const discountedMonthly = fullPriceMonthly * (1 - SMARTLEAD.discount);
  
  // Calculate months at full price vs discounted
  const fullPriceMonths = Math.min(SMARTLEAD.discountAfterMonth, months);
  const discountedMonths = Math.max(0, months - SMARTLEAD.discountAfterMonth);
  
  const totalMonthly = (fullPriceMonthly * fullPriceMonths) + (discountedMonthly * discountedMonths);
  const total = oneTime + totalMonthly;
  const avgMonthly = totalMonthly / months;
  
  return {
    name: SMARTLEAD.name,
    oneTime: {
      domains: domainCost,
      mailboxSetup: 0,
      total: oneTime
    },
    monthly: {
      beforeDiscount: fullPriceMonthly,
      afterDiscount: discountedMonthly,
      average: avgMonthly
    },
    projection: {
      months,
      total,
      perMonth: total / months
    },
    notes: [
      `${domainsNeeded} .com domains @ $${SMARTLEAD.domainPrice}`,
      `$${SMARTLEAD.perMailboxMonthly}/mailbox/month`,
      `15% discount after month ${SMARTLEAD.discountAfterMonth}`,
    ]
  };
}

// ═══════════════════════════════════════════════════════════════
// OUTPUT FORMATTING
// ═══════════════════════════════════════════════════════════════

function formatCurrency(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatStandard(zapmail, smartlead, mailboxes, months) {
  const lines = [];
  const winner = zapmail.projection.total < smartlead.projection.total ? 'Zapmail' : 'SmartLead';
  const savings = Math.abs(zapmail.projection.total - smartlead.projection.total);
  
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('💰 EMAIL INFRASTRUCTURE PRICING CALCULATOR');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`Comparing ${mailboxes} mailboxes over ${months} months`);
  lines.push('');
  
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ ZAPMAIL + DYNADOT (DIY)                                     │');
  lines.push('├─────────────────────────────────────────────────────────────┤');
  lines.push(`│ One-time:                                                   │`);
  lines.push(`│   • Domains (${Math.ceil(mailboxes/12)} × $3 .info):           ${formatCurrency(zapmail.oneTime.domains).padStart(20)} │`);
  lines.push(`│   • Mailbox setup (${mailboxes} × $30):        ${formatCurrency(zapmail.oneTime.mailboxSetup).padStart(20)} │`);
  lines.push(`│   • TOTAL ONE-TIME:                    ${formatCurrency(zapmail.oneTime.total).padStart(20)} │`);
  lines.push(`│                                                             │`);
  lines.push(`│ Monthly (quarterly + 10% affiliate):                        │`);
  lines.push(`│   • Platform fee:                      ${formatCurrency(zapmail.monthly.base).padStart(20)} │`);
  lines.push(`│                                                             │`);
  lines.push(`│ ${months}-MONTH TOTAL:                         ${formatCurrency(zapmail.projection.total).padStart(20)} │`);
  lines.push(`│ Per month avg:                         ${formatCurrency(zapmail.projection.perMonth).padStart(20)} │`);
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push('│ SMARTLEAD                                                   │');
  lines.push('├─────────────────────────────────────────────────────────────┤');
  lines.push(`│ One-time:                                                   │`);
  lines.push(`│   • Domains (${Math.ceil(mailboxes/12)} × $13 .com):         ${formatCurrency(smartlead.oneTime.domains).padStart(20)} │`);
  lines.push(`│   • TOTAL ONE-TIME:                    ${formatCurrency(smartlead.oneTime.total).padStart(20)} │`);
  lines.push(`│                                                             │`);
  lines.push(`│ Monthly:                                                    │`);
  lines.push(`│   • Months 1-2 (${mailboxes} × $4.50):         ${formatCurrency(smartlead.monthly.beforeDiscount).padStart(20)} │`);
  lines.push(`│   • Month 3+ (15% off):                ${formatCurrency(smartlead.monthly.afterDiscount).padStart(20)} │`);
  lines.push(`│                                                             │`);
  lines.push(`│ ${months}-MONTH TOTAL:                         ${formatCurrency(smartlead.projection.total).padStart(20)} │`);
  lines.push(`│ Per month avg:                         ${formatCurrency(smartlead.projection.perMonth).padStart(20)} │`);
  lines.push('└─────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push(`🏆 WINNER: ${winner} saves ${formatCurrency(savings)} over ${months} months`);
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('⚠️  Note: Zapmail $30/mailbox assumed to be ONE-TIME setup fee.');
  lines.push('   If it\'s monthly, SmartLead is significantly cheaper.');
  
  return lines.join('\n');
}

function formatTelegram(zapmail, smartlead, mailboxes, months) {
  const winner = zapmail.projection.total < smartlead.projection.total ? 'Zapmail' : 'SmartLead';
  const savings = Math.abs(zapmail.projection.total - smartlead.projection.total);
  
  const lines = [];
  lines.push(`💰 *${mailboxes} mailboxes × ${months} months*`);
  lines.push('');
  lines.push('*Zapmail + Dynadot:*');
  lines.push(`• Setup: ${formatCurrency(zapmail.oneTime.total)}`);
  lines.push(`• Monthly: ${formatCurrency(zapmail.monthly.base)}`);
  lines.push(`• *Total: ${formatCurrency(zapmail.projection.total)}*`);
  lines.push('');
  lines.push('*SmartLead:*');
  lines.push(`• Setup: ${formatCurrency(smartlead.oneTime.total)}`);
  lines.push(`• Monthly: ~${formatCurrency(smartlead.monthly.average)}`);
  lines.push(`• *Total: ${formatCurrency(smartlead.projection.total)}*`);
  lines.push('');
  lines.push(`🏆 ${winner} saves ${formatCurrency(savings)}`);
  lines.push('');
  lines.push('_Assumes $30/mailbox is one-time_');
  
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

const zapmail = calculateZapmail(mailboxes, months);
const smartlead = calculateSmartLead(mailboxes, months);

if (telegram) {
  console.log(formatTelegram(zapmail, smartlead, mailboxes, months));
} else {
  console.log(formatStandard(zapmail, smartlead, mailboxes, months));
}
