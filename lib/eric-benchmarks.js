/**
 * Eric's Deliverability Benchmarks
 * Based on GEX Deliverability Guide
 * These are the gold-standard thresholds for cold email infrastructure
 */

const ERIC_BENCHMARKS = {
  // Inbox-level thresholds
  inbox: {
    minReputation: 98,        // Pull inbox if <98%
    minReplyRate: 1,          // Campaign-level concern if <1%
  },
  
  // Domain-level thresholds
  domain: {
    minReplyRate: 1,          // Cancel domain if <1% replies
    maxBounceRate: 2,         // >2% bounces = domain problem
    maxBadInboxRatio: 0.2,    // 10/50 (20%) aliases <98% = ban domain (Hypertide rule)
    bottomPercentile: 10,     // Bottom 10% of domains should be flagged
  },
  
  // Capacity planning
  capacity: {
    headroomMultiplier: 1.5,  // Provision 1.5x ADV
    backupPoolRatio: 0.5,     // 50% of ADV as warmed backups
    maxInboxesPerCampaign: 1500, // Smartlead limit for HyperTide
  },
  
  // Pacing
  pacing: {
    inboxIntervalMinutes: 60,    // 60 min between sends per inbox
    campaignIntervalMinutes: 63, // 63 min at campaign level
  },
  
  // Domain aging for hard-to-reach (Outlook/Proofpoint)
  aging: {
    minWeeksForOutlook: 4,    // 4+ weeks for Outlook
    idealWeeksForOutlook: 8,  // 8+ weeks is ideal
  },
  
  // Status labels
  getInboxStatus(reputation) {
    if (reputation >= 98) return { status: 'healthy', color: '#22c55e', action: 'keep' };
    if (reputation >= 90) return { status: 'warning', color: '#eab308', action: 'monitor' };
    return { status: 'pull', color: '#ef4444', action: 'remove immediately' };
  },
  
  getDomainStatus(domain) {
    const issues = [];
    
    // Check reputation (if we have per-inbox data)
    if (domain.avgReputation < 98) {
      issues.push({ type: 'reputation', message: `Avg reputation ${domain.avgReputation}% < 98%`, severity: 'critical' });
    }
    
    // Check bounce rate
    if (domain.bounceRate > 2) {
      issues.push({ type: 'bounces', message: `Bounce rate ${domain.bounceRate.toFixed(1)}% > 2%`, severity: 'critical' });
    }
    
    // Check reply rate (need meaningful volume)
    if (domain.sent >= 100 && domain.replyRate < 1) {
      issues.push({ type: 'replies', message: `Reply rate ${domain.replyRate.toFixed(1)}% < 1%`, severity: 'warning' });
    }
    
    // Check bad inbox ratio (Hypertide 10/50 rule)
    if (domain.inboxesBelow98 && domain.totalInboxes) {
      const badRatio = domain.inboxesBelow98 / domain.totalInboxes;
      if (badRatio >= 0.2) {
        issues.push({ type: 'hypertide', message: `${domain.inboxesBelow98}/${domain.totalInboxes} inboxes <98% (≥20%)`, severity: 'critical' });
      }
    }
    
    // Determine overall status
    const hasCritical = issues.some(i => i.severity === 'critical');
    const hasWarning = issues.some(i => i.severity === 'warning');
    
    return {
      status: hasCritical ? 'kill' : hasWarning ? 'warning' : 'healthy',
      color: hasCritical ? '#ef4444' : hasWarning ? '#eab308' : '#22c55e',
      action: hasCritical ? 'cancel & reorder' : hasWarning ? 'monitor closely' : 'keep sending',
      issues
    };
  },
  
  // Check capacity health
  getCapacityStatus(currentADV, totalCapacity, backupCapacity) {
    const issues = [];
    
    const headroom = totalCapacity / currentADV;
    if (headroom < 1.5) {
      issues.push({ 
        type: 'headroom', 
        message: `Only ${headroom.toFixed(1)}x headroom (need 1.5x)`,
        severity: 'warning'
      });
    }
    
    const backupRatio = backupCapacity / currentADV;
    if (backupRatio < 0.5) {
      issues.push({
        type: 'backup',
        message: `Only ${(backupRatio * 100).toFixed(0)}% backup pool (need 50%)`,
        severity: 'warning'
      });
    }
    
    return {
      headroom,
      backupRatio,
      healthy: issues.length === 0,
      issues
    };
  },
  
  // Find bottom 10% domains
  flagBottomDomains(domains) {
    if (domains.length < 10) return [];
    
    // Sort by reply rate
    const sorted = [...domains]
      .filter(d => d.sent >= 50) // Only domains with meaningful volume
      .sort((a, b) => a.replyRate - b.replyRate);
    
    const cutoff = Math.ceil(sorted.length * 0.1);
    return sorted.slice(0, cutoff).map(d => ({
      domain: d.domain,
      replyRate: d.replyRate,
      reason: 'bottom 10% by reply rate'
    }));
  }
};

module.exports = ERIC_BENCHMARKS;
