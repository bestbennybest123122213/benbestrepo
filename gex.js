#!/usr/bin/env node
/**
 * GEX CLI - Lead Generation Command Center
 * Complete tool suite for managing the lead pipeline.
 * 
 * Usage: node gex.js <command> [options]
 * 
 * Quick Start:
 *   node gex.js setup   - Initialize directories and config
 *   node gex.js doctor  - Diagnose configuration issues
 *   node gex.js help    - Show available commands
 *   node gex.js list    - List all commands
 * 
 * Global Flags:
 *   --verbose, -V  - Show debug output
 *   --quiet, -q    - Minimal output
 */

// ANSI colors for better terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  
  // Semantic helpers
  error: (s) => `\x1b[31m${s}\x1b[0m`,
  success: (s) => `\x1b[32m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  info: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};

const commands = {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Daily Ops
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  start: './startup.js',
  status: './status.js',
  daily: './daily-routine.js',
  morning: './morning-routine.js',
  'morning-routine': './morning-routine.js',
  gm: './morning-routine.js',  // good morning alias
  
  // Priority Actions
  actions: './priority-actions.js',
  todo: './priority-actions.js',
  priorities: './priority-actions.js',
  next: './priority-actions.js',
  
  // Status Comparison
  compare: './status-compare.js',
  changes: './status-compare.js',
  diff: './status-compare.js',
  
  // End of Day Summary
  eod: './eod-summary.js',
  endofday: './eod-summary.js',
  'end-of-day': './eod-summary.js',
  wrap: './eod-summary.js',
  planner: './daily-planner.js',
  brief: './morning-brief.js',
  digest: './telegram-digest.js',
  weekly: './weekly-performance.js',
  pulse: './pulse.js',
  dash: './dashboard-cli.js',
  exec: './executive-summary.js',
  today: './today.js',
  
  // Daily Focus - THE ONE thing for today
  focus: './daily-focus.js',
  one: './daily-focus.js',
  'the-one': './daily-focus.js',
  'today-focus': './daily-focus.js',
  single: './daily-focus.js',
  
  // Emergency Mode - Ultra-minimal single action
  emergency: './commands/emergency.js',
  sos: './commands/emergency.js',
  urgent: './commands/emergency.js',
  now: './commands/emergency.js',
  
  // Inaction Cost Tracker
  cost: './commands/cost.js',
  burn: './commands/cost.js',
  'cost-of-inaction': './commands/cost.js',
  loss: './commands/cost.js',
  
  // Engagement Streak Tracker
  engaged: './commands/engaged.js',
  activity: './commands/engaged.js',
  'did-something': './commands/engaged.js',
  active: './commands/engaged.js',
  
  // Positive Replies Tracker
  positives: './commands/positives.js',
  
  // Referral System (Inbound Growth)
  referral: './commands/referrals.js',
  referrals: './commands/referrals.js',
  refer: './commands/referrals.js',
  
  // Inbound Metrics & Strategy
  inbound: './commands/inbound.js',
  'inbound-strategy': './commands/inbound.js',
  'inbound-stats': './commands/inbound.js',
  'inbound-weekly': './commands/inbound-weekly.js',
  'inbound-report': './commands/inbound-weekly.js',
  'inbound-score': './commands/inbound-score.js',
  iscore: './commands/inbound-score.js',
  
  // Case Studies Manager
  casestudies: './commands/casestudies.js',
  cases: './commands/casestudies.js',
  'case-study': './commands/casestudies.js',
  
  // Content Calendar & Tracking
  content: './commands/content.js',
  linkedin: './commands/content.js',
  posts: './commands/content.js',
  
  // Industry Presence Tracker
  presence: './commands/presence.js',
  podcasts: './commands/presence.js',
  speaking: './commands/presence.js',
  
  // Quick Standup
  standup: './commands/standup.js',
  su: './commands/standup.js',
  
  // Intent Signal Detector (Eric Nowoslawski framework)
  intent: './commands/intent.js',
  signals: './commands/intent.js',
  'buying-signals': './commands/intent.js',
  'hot-leads': './commands/intent.js',
  
  // Lookalike Company Finder
  lookalike: './commands/lookalike.js',
  similar: './commands/lookalike.js',
  'find-similar': './commands/lookalike.js',
  prospects: './commands/lookalike.js',
  
  // A/B Test Analyzer
  ab: './commands/ab-test.js',
  'ab-test': './commands/ab-test.js',
  'ab-analyze': './commands/ab-test.js',
  significance: './commands/ab-test.js',
  
  // Lead Magnet Templates
  magnets: './commands/magnets.js',
  leadmag: './commands/magnets.js',
  'lead-magnets': './commands/magnets.js',
  offers: './commands/magnets.js',
  
  // Quick Pitch Generator (Eric's Why You Why Now)
  barrows: './commands/pitch.js',
  'why-you': './commands/pitch.js',
  'pitch-gen': './commands/pitch.js',
  wpitch: './commands/pitch.js',
  
  // Campaign Router (Graduation Table)
  route: './commands/route.js',
  router: './commands/route.js',
  'campaign-route': './commands/route.js',
  grad: './commands/route.js',
  
  // Action Pack (Morning Summary)
  'action-pack': './commands/action-pack.js',
  apack: './commands/action-pack.js',
  actions2: './commands/action-pack.js',
  pack: './commands/action-pack.js',
  
  // Email Builder ($500K Framework)
  'email-builder': './commands/email-builder.js',
  compose: './commands/email-builder.js',
  builder: './commands/email-builder.js',
  '500k': './commands/email-builder.js',
  
  // Data Gaps Analyzer
  gaps: './commands/gaps.js',
  'data-gaps': './commands/gaps.js',
  missing: './commands/gaps.js',
  enrich: './commands/gaps.js',
  
  // LDS Integration Bridge
  lds: './commands/lds-bridge.js',
  'lead-discovery': './commands/lds-bridge.js',
  discovery: './commands/lds-bridge.js',
  'positive-replies': './commands/positives.js',
  posrep: './commands/positives.js',
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Lead Management
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  meetings: './meeting-converter.js',
  'book-now': './meeting-converter.js',
  unbooked: './meeting-converter.js',
  'meeting-requests': './meeting-converter.js',
  booknow: './meeting-converter.js',
  closer: './meeting-closer.js',
  rank: './lead-ranker.js',
  opportunities: './opportunity-finder.js',
  wins: './milestones.js',
  
  // Win Streak Recovery
  streak: './streak-recovery.js',
  recovery: './streak-recovery.js',
  'close-streak': './streak-recovery.js',
  winback: './streak-recovery.js',
  'win-path': './streak-recovery.js',
  
  'quick-wins': './quick-wins.js',
  quickwin: './quick-win.js',
  easy: './quick-win.js',
  quick: './quick-win.js',
  lowhanging: './quick-win.js',
  momentum: './quick-win.js',
  funnel: './funnel-analyzer.js',
  prep: './smart-meeting-prep.js',
  drafts: './draft-emails.js',
  response: './response-optimizer.js',
  reactivate: './reactivate.js',
  rehit: './rehit.js',
  'campaign-dx': './campaign-diagnosis.js',
  'cdx': './campaign-diagnosis.js',
  volume: './volume-analyzer.js',
  'vol': './volume-analyzer.js',
  scorecard: './weekly-scorecard.js',
  'weekly-score': './weekly-scorecard.js',
  'last-chance': './last-chance.js',
  'lc': './last-chance.js',
  deals: './deals.js',
  pipeline: './deals.js',
  alert: './response-alert.js',
  alerts: './response-alert.js',
  commission: './commission.js',
  earnings: './commission.js',
  milestones: './milestones.js',
  'revenue-wins': './milestones.js',
  celebrate: './milestones.js',
  proposal: './proposal.js',
  pitch: './proposal.js',
  casestudy: './case-study.js',
  'case-study': './case-study.js',
  quickpitch: './quick-pitch.js',
  'quick-pitch': './quick-pitch.js',
  qp: './quick-pitch.js',
  brief: './campaign-brief.js',
  'campaign-brief': './campaign-brief.js',
  forecast: './revenue-forecast.js',
  revenue: './revenue-forecast.js',
  money: './revenue-forecast.js',
  
  // Revenue Predictor
  predict: './revenue-predict.js',
  'forecast-revenue': './revenue-predict.js',
  'revenue-forecast-v2': './revenue-predict.js',
  projection: './revenue-predict.js',
  
  'morning-pack': './morning-pack.js',
  morningpack: './morning-pack.js',
  mp: './morning-pack.js',
  wakeup: './morning-pack.js',
  closer: './deal-closer.js',
  'deal-closer': './deal-closer.js',
  close: './deal-closer.js',
  doctor: './pipeline-doctor.js',
  diagnose: './pipeline-doctor.js',
  checkup: './pipeline-doctor.js',
  campaigns: './campaigns.js',
  cases: './campaigns.js',
  score: './lead-score.js',
  scoring: './lead-score.js',
  calendar: './calendar-helper.js',
  mark: './mark-contacted.js',
  schedule: './smart-scheduler.js',
  templates: './email-templates.js',
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Research
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  research: './company-research.js',
  competitors: './competitor-intel.js',
  comprates: './competitor-rates.js',
  competitorrates: './competitor-rates.js',
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Data & Analytics
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  cleanup: './data-cleanup.js',
  enrich: './lead-enrichment.js',
  performance: './email-performance.js',
  tracker: './performance-tracker.js',
  goals: './goal-tracker.js',
  goal: './goal-tracker.js',        // alias
  targets: './goal-tracker.js',     // alias
  export: './export-data.js',
  backup: './backup-system.js',
  report: './full-report.js',
  invoices: './invoice-tracker.js',
  invoice: './invoice-tracker.js',
  leadsource: './lead-source-analytics.js',
  leadsourceanalytics: './lead-source-analytics.js',
  
  // Strategic Analysis
  verticals: './strategic-insights.js',
  'vertical-analysis': './strategic-insights.js',
  strategy: './strategic-insights.js',
  
  // Vertical Deep Dive
  vertical: './vertical-dive.js',
  vdive: './vertical-dive.js',
  vd: './vertical-dive.js',
  drill: './vertical-dive.js',
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Notifications & Alerts
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  notify: './notify.js',
  prevent: './stale-prevention.js',
  hotdraft: './hot-email-drafter.js',
  suggest: './suggest-response.js',
  reply: './suggest-response.js',    // alias
  queue: './action-queue.js',
  sendq: './action-queue.js',        // alias
  routine: './morning-routine.js',
  morning: './morning-routine.js',   // alias
  qm: './quick-mark.js',
  quickmark: './quick-mark.js',      // alias
  weekly: './weekly-report.js',
  report: './weekly-report.js',      // alias
  followups: './followup-scheduler.js',
  schedule: './followup-scheduler.js', // alias
  prep: './meeting-prep.js',
  callprep: './meeting-prep.js',       // alias
  roi: './roi-calculator.js',
  value: './roi-calculator.js',        // alias
  velocity: './pipeline-velocity.js',
  speed: './pipeline-velocity.js',     // alias
  book: './booking-helper.js',
  booking: './booking-helper.js',      // alias
  campaign: './campaign-performance.js',
  perf: './campaign-performance.js',   // alias
  dashboard: './generate-dashboard.js',
  dash: './generate-dashboard.js',     // alias
  notify: './telegram-notify.js',
  tg: './telegram-notify.js',          // alias
  winloss: './win-loss.js',
  wl: './win-loss.js',                 // alias
  qs: './quick-status.js',             // quick status one-liner
  start: './getting-started.js',       // getting started guide
  guide: './getting-started.js',       // alias
  analytics: './analytics.js',         // analytics summary
  stats: './analytics.js',             // alias
  analyze: './lead-analysis.js',       // lead pattern analysis
  patterns: './lead-analysis.js',      // alias
  briefing: './morning-briefing-generator.js',  // comprehensive morning briefing
  enrich: './lead-enrichment.js',              // lead enrichment tool
  score: './lead-enrichment.js',               // alias
  templates: './email-templates.js',           // email template library
  hb: './heartbeat-check.js',
  forecast: './revenue-forecast.js',
  next: './next-action.js',
  cron: './cron-tasks.js',
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Infrastructure (FIXED: health was duplicated)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  healthmon: './health-monitor.js',       // System health monitor
  health: './pipeline-health.js',          // Pipeline health (primary)
  integrity: './data-integrity-check.js',  // Verify data matches SmartLead
  'data-check': './data-integrity-check.js',
  webhook: './webhook-handler.js',
  smartleadwebhook: './smartlead-webhook.js',
  server: './server.js',
  api: './api-docs.js',
  sync: './smartlead-sync.js',
  
  // Global Analytics Scraper (API-based)
  'global-analytics': './scrape-global-analytics.js',
  'global': './scrape-global-analytics.js',
  'scrape': './scrape-global-analytics.js',
  'scrape-analytics': './scrape-global-analytics.js',
  
  // SmartLead CLI Sync - THE NEW GOLD STANDARD (CLI-based, no browser)
  // Uses Smartlead CLI commands: daily-sent, daily, daily-replies-sent
  'cli-sync': './smartlead-cli-sync.js',
  'cli': './smartlead-cli-sync.js',
  'smartlead-cli': './smartlead-cli-sync.js',
  'cli-refresh': './smartlead-cli-sync.js',  // Alias for consistency
  
  // SmartLead UI Scraper - LEGACY (Puppeteer - deprecated in favor of CLI)
  // This is the ONLY method that produces 100% accurate data
  'scrape-ui': './scrape-smartlead-ui.js',
  'scrape-smartlead': './scrape-smartlead-ui.js',
  'ui-scrape': './scrape-smartlead-ui.js',
  'gold-standard': './smartlead-cli-sync.js',  // Now points to CLI sync
  'auto-scrape': './cron-ui-scrape.js',  // Automated version (runs via cron at 7am/11pm Warsaw)
  
  // SmartLead → Supabase Sync (stores all data in DB)
  'sync-db': './sync-smartlead-to-supabase.js',
  'sync-supabase': './sync-smartlead-to-supabase.js',
  'db-sync': './sync-smartlead-to-supabase.js',
  'smartlead-db': './sync-smartlead-to-supabase.js',
  
  // Data Sources Status
  'data-sources': './data-sources-status.js',
  'data-status': './data-sources-status.js',
  'ds': './data-sources-status.js',
  'sources': './data-sources-status.js',
  
  // Pending Leads Monitor
  'pending': './pending-leads-monitor.js',
  'pending-leads': './pending-leads-monitor.js',
  'nofollowup': './pending-leads-monitor.js',
  
  // Batch Follow-up Generator
  'batch-followups': './batch-followups.js',
  'batch': './batch-followups.js',
  'bf': './batch-followups.js',
  'followup-all': './batch-followups.js',
  'rescue-all': './batch-followups.js',
  
  // Pending Leads Alert (for cron)
  'pending-alert': './pending-alert.js',
  'palert': './pending-alert.js',
  
  // Batch Mark (after sending batch emails)
  'batch-mark': './batch-mark.js',
  'bm': './batch-mark.js',
  'mark-all': './batch-mark.js',
  'mark-batch': './batch-mark.js',
  
  'ab-tracker': './ab-test-tracker.js',
  'ab-track': './ab-test-tracker.js',
  velocity: './velocity-tracker.js',
  conversion: './conversion-calc.js',
  scorecard: './lead-scorecard.js',
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Daily Reporting & Analysis
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  dd: './daily-digest.js',
  fast: './fast-response.js',
  reengage: './stale-reengager.js',
  rtt: './response-time-tracker.js',
  inbox: './priority-inbox.js',
  book: './booking-assistant.js',
  winrate: './win-rate.js',
  nba: './next-best-action.js',
  tgalert: './telegram-alert.js',
  enricher: './lead-enricher.js',
  seq: './sequence-tracker.js',
  batch: './batch-email-generator.js',
  campaigns: './campaign-analyzer.js',
  morning: './morning-routine.js',
  score: './lead-scorer.js',
  autofollowup: './auto-followup.js',
  dealvelocity: './deal-velocity.js',
  outreach: './outreach-optimizer.js',
  revenue: './revenue-projector.js',
  notes: './lead-notes.js',
  summary: './daily-summary-cron.js',
  qa: './quick-actions-cli.js',
  pipreport: './pipeline-report.js',
  dupes: './duplicate-finder.js',
  diff: './pipeline-diff.js',
  company: './company-lookup.js',
  enterprise: './enterprise-tracker.js',
  weeklywins: './weekly-wins.js',
  fu: './followup-generator.js',
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Overnight & Batch Tools (Feb 6 2026)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  pdrafts: './generate-priority-drafts.js',
  enrich2: './enrich-unknown-leads.js',
  alert: './hot-lead-alert.js',
  insights: './conversion-insights.js',
  followup: './smart-followup-scheduler.js',
  optimize: './campaign-optimizer.js',
  dreport: './daily-report-generator.js',
  rhelp: './research-helper.js',
  action: './action-center.js',
  mprep: './meeting-prep-generator.js',
  trends: './weekly-trends.js',
  roi: './roi-calculator.js',
  stale: './stale-reactivation.js',
  compintel: './competitive-intel.js',
  overnight: './overnight-summary.js',
  email: './smart-email-generator.js',
  syshealth: './system-health.js',
  qwins: './quick-win-finder.js',
  booking: './booking-messages.js',
  viz: './pipeline-viz.js',
  tg: './telegram-summary.js',
  recent: './recent.js',
  validate: './validate.js',
  watch: './watch.js',
  info: './info.js',
  mc: './mc.js',
  bulk: './bulk.js',
  start: './start-day.js',
  tips: './tips.js',
  hotkeys: './hotkeys.js',
  keys: './hotkeys.js',
  workflow: './workflow.js',
  guide: './workflow.js',
  motd: './motd.js',
  motivation: './motd.js',
  onboarding: './onboarding.js',
  welcome: './onboarding.js',
  sysstats: './sysstats.js',
  about: './about.js',
  favorites: './favorites.js',
  fav: './favorites.js',
  history: './history.js',
  hist: './history.js',
  timer: './focus.js',       // Manual focus timer (gex timer "task")
  pomodoro: './focus.js',
  stats: './stats.js',
  combined: './stats.js',
  
  // Email Performance Analyzer
  'email-stats': './email-perf.js',
  eperf: './email-perf.js',
  'email-performance': './email-perf.js',
  ep: './email-perf.js',
  'email-perf': './email-perf.js',
  
  // Lead Decay Visualizer
  decay: './lead-decay.js',
  'value-loss': './lead-decay.js',
  aging: './lead-decay.js',
  
  // Decay Prevention
  prevent: './decay-prevention.js',
  'decay-prevent': './decay-prevention.js',
  atrisk: './decay-prevention.js',
  'at-risk': './decay-prevention.js',
  
  // Pipeline Health Score
  pscore: './pipeline-score.js',
  'health-score': './pipeline-score.js',
  phealth: './pipeline-score.js',
  
  // Weekly Challenge System (Gamification)
  challenge: './weekly-challenge.js',
  challenges: './weekly-challenge.js',
  
  // Stale Lead Archiver
  archive: './archive.js',
  cleanup: './archive.js',
  purge: './archive.js',
  
  // Overnight Work Report
  overnight: './overnight-report.js',
  built: './overnight-report.js',
  night: './overnight-report.js',
  
  // Pipeline Score Improvement Plan
  plan: './score-plan.js',
  improve: './score-plan.js',
  'score-plan': './score-plan.js',
  
  // Quick Send Tool
  send: './quick-send.js',
  mailto: './quick-send.js',
  'quick-send': './quick-send.js',
  
  // Daily Domain Health Report
  'health-report': './daily-health-report.js',
  'domain-health': './daily-health-report.js',
  domains: './daily-health-report.js',
  
  // Domain Health Alerts & Recovery
  'domain-alerts': './domain-alerts.js',
  'domain-alert': './domain-alerts.js',
  'domain-monitor': './domain-alerts.js',
  dmonitor: './domain-alerts.js',
  
  // Account Optimizer
  accounts: './account-optimizer.js',
  'account-health': './account-optimizer.js',
  'account-optimizer': './account-optimizer.js',
  mailboxes: './account-optimizer.js',
  ao: './account-optimizer.js',
  
  // Pricing Calculator
  pricing: './pricing-calculator.js',
  'pricing-calc': './pricing-calculator.js',
  'price-compare': './pricing-calculator.js',
  zapmail: './pricing-calculator.js',
  
  // Domain Analyzer - Eric's Framework
  'domain-check': './domain-analyzer.js',
  'domain-analyze': './domain-analyzer.js',
  dcheck: './domain-analyzer.js',
  'eric-check': './domain-analyzer.js',
  replace: './domain-analyzer.js',
  
  // Performance Trend Alerts
  perf: './performance-alert.js',
  performance: './performance-alert.js',
  'perf-alert': './performance-alert.js',
  trends: './performance-alert.js',
  
  // Quick Fix - What to do right now
  fix: './quick-fix.js',
  'quick-fix': './quick-fix.js',
  now: './quick-fix.js',
  urgent: './quick-fix.js',
  alert: './performance-alert.js',
  
  'weekly-challenge': './weekly-challenge.js',
  gamify: './weekly-challenge.js',
  
  // Scheduling Rescue System
  rescue: './rescue.js',
  'rescue-leads': './rescue.js',
  stuck: './rescue.js',
  unstick: './rescue.js',
  
  // Critical Lead Triage System
  triage: './triage.js',
  critical: './triage.js',
  save: './triage.js',
  'critical-leads': './triage.js',
  priority: './triage.js',
  
  // Lead Death Alert System
  alert: './lib/lead-alert.js',
  alerts: './lib/lead-alert.js',
  'lead-alert': './lib/lead-alert.js',
  'death-alert': './lib/lead-alert.js',
  threshold: './lib/lead-alert.js',
  
  // Engagement Tracker
  engage: './lib/engagement-tracker.js',
  engagement: './lib/engagement-tracker.js',
  'engagement-tracker': './lib/engagement-tracker.js',
  track: './lib/engagement-tracker.js',
  
  // Quick Reply Generator
  reply: './lib/quick-reply.js',
  'quick-reply': './lib/quick-reply.js',
  qr: './lib/quick-reply.js',
  respond: './lib/quick-reply.js',
  
  // Morning Telegram Briefing
  'morning-tg': './lib/morning-telegram.js',
  'morning-telegram': './lib/morning-telegram.js',
  'tg-briefing': './lib/morning-telegram.js',
  briefing: './lib/morning-telegram.js',
  
  // Lead Source Analyzer
  source: './lib/source-analyzer.js',
  sources: './lib/source-analyzer.js',
  'source-analyze': './lib/source-analyzer.js',
  'lead-source': './lib/source-analyzer.js',
  
  // Win/Loss Post-mortem
  'win-loss': './lib/win-loss.js',
  winloss: './lib/win-loss.js',
  postmortem: './lib/win-loss.js',
  patterns: './lib/win-loss.js',
  
  // Campaign Health Monitor
  health: './lib/campaign-health.js',
  'campaign-health': './lib/campaign-health.js',
  checkup: './lib/campaign-health.js',
  diagnose: './lib/campaign-health.js',
  
  // Response Time Tracker
  response: './lib/response-tracker.js',
  'response-time': './lib/response-tracker.js',
  speed: './lib/response-tracker.js',
  latency: './lib/response-tracker.js',
  
  // New Reply Detector
  new: './lib/new-replies.js',
  'new-replies': './lib/new-replies.js',
  fresh: './lib/new-replies.js',
  incoming: './lib/new-replies.js',
  
  // Deal Value Calculator
  value: './lib/deal-value.js',
  'deal-value': './lib/deal-value.js',
  revenue: './lib/deal-value.js',
  worth: './lib/deal-value.js',
  
  // Weekly Performance Email
  'weekly-email': './lib/weekly-email.js',
  'week-report': './lib/weekly-email.js',
  'performance-email': './lib/weekly-email.js',
  
  // Lead Decay Visualizer
  'decay-live': './lib/decay-live.js',
  burn: './lib/decay-live.js',
  'burn-rate': './lib/decay-live.js',
  aging: './lib/decay-live.js',
  
  // One-Click Actions
  oneclick: './lib/one-click.js',
  'one-click': './lib/one-click.js',
  quick: './lib/one-click.js',
  ez: './lib/one-click.js',
  
  // Unified Action Dashboard
  actions: './unified-actions.js',
  everything: './unified-actions.js',
  master: './unified-actions.js',
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Lead Generation Manager (Feb 11 2026)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  lgm: './lgm-wrapper.js',
  'lead-gen': './lgm-wrapper.js',
  'lead-manager': './lgm-wrapper.js',
  newleads: './lgm-wrapper.js',
  'find-leads': './lgm-wrapper.js',
  prospecting: './lgm-wrapper.js',
  
  // Unified Leads View (GEX + LDS combined)
  unified: './unified.js',
  'unified-leads': './unified.js',
  combined: './unified.js',
  all: './unified.js',
  leads: './unified.js',
  overview: './unified.js'
};

const args = process.argv.slice(2);

// Check for global flags
const verbose = args.includes('--verbose') || args.includes('-V');
const quiet = args.includes('--quiet') || args.includes('-q');
const filteredArgs = args.filter(a => !['--verbose', '-V', '--quiet', '-q'].includes(a));
const command = filteredArgs[0];

// Helper for verbose logging
const log = {
  debug: (msg) => verbose && console.log(`[DEBUG] ${msg}`),
  info: (msg) => !quiet && console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg)
};

if (verbose) {
  log.debug(`GEX CLI starting`);
  log.debug(`Working directory: ${__dirname}`);
  log.debug(`Command: ${command || '(none)'}`);
  log.debug(`Args: ${filteredArgs.slice(1).join(' ') || '(none)'}`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  if (!quiet) console.log('\n\n👋 Interrupted. Goodbye!\n');
  process.exit(130);
});

process.on('SIGTERM', () => {
  if (verbose) log.debug('Received SIGTERM');
  process.exit(143);
});

// Handle uncaught errors gracefully
process.on('uncaughtException', (err) => {
  console.error(`\n❌ Unexpected error: ${err.message}`);
  if (verbose) console.error(err.stack);
  console.error('\n💡 Run with --verbose for more details');
  console.error('   Or report an issue if this persists\n');
  process.exit(1);
});

// Version/info command
if (command === 'version' || command === '--version' || command === '-v') {
  const fs = require('fs');
  const path = require('path');
  const cmdCount = Object.keys(commands).length;
  
  // Load package.json with fallback
  let pkg = { version: '1.0.0', name: 'gex-cli' };
  try {
    pkg = require('./package.json');
  } catch (e) {
    console.warn('  ⚠️  package.json not found, using defaults');
  }
  
  // Check config file
  let configStatus = '❌ Missing';
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    configStatus = '✅ Found';
    require('dotenv').config({ path: envPath });
  } else if (fs.existsSync(path.join(__dirname, '.env.example'))) {
    configStatus = '⚠️  Missing (copy .env.example → .env)';
  }
  
  // Check database configuration
  let dbStatus = '❌ Not configured';
  let dbDetails = '';
  if (process.env.SUPABASE_URL) {
    const url = new URL(process.env.SUPABASE_URL);
    dbStatus = '✅ Configured';
    dbDetails = ` (${url.hostname.split('.')[0]})`;
    
    if (!process.env.SUPABASE_KEY && !process.env.SUPABASE_ANON_KEY) {
      dbStatus = '⚠️  URL set but missing API key';
      dbDetails = '\n             Set SUPABASE_KEY or SUPABASE_ANON_KEY';
    }
  } else {
    dbDetails = '\n             Set SUPABASE_URL in .env file';
  }
  
  // Check required directories
  const dataDir = path.join(__dirname, 'data');
  const logsDir = path.join(__dirname, 'logs');
  const dirs = [];
  if (!fs.existsSync(dataDir)) dirs.push('data/');
  if (!fs.existsSync(logsDir)) dirs.push('logs/');
  
  // Count implemented vs total commands
  let implemented = 0;
  Object.values(commands).forEach(script => {
    if (fs.existsSync(path.join(__dirname, script))) implemented++;
  });
  
  console.log(`
  ╭──────────────────────────────────╮
  │  GEX CLI v${(pkg.version || '1.0.0').padEnd(22)}│
  ╰──────────────────────────────────╯
  
  Commands:    ${cmdCount} available (${implemented} implemented)
  Node:        ${process.version}
  Config:      ${configStatus}
  Database:    ${dbStatus}${dbDetails}
  Directory:   ${__dirname}
  ${dirs.length > 0 ? `\n  ⚠️  Missing dirs: ${dirs.join(', ')} (will be created on first use)` : ''}
  
  💡 Run "node gex.js doctor" to diagnose issues
  `);
  process.exit(0);
}

// Setup command - first-time initialization
if (command === 'setup' || command === 'init') {
  const fs = require('fs');
  const path = require('path');
  const readline = require('readline');
  
  console.log(`
╭──────────────────────────────────────────────────────────────╮
│  🚀 GEX SETUP WIZARD                                          │
╰──────────────────────────────────────────────────────────────╯
`);
  
  // Create required directories
  const dirs = ['data', 'logs', 'backups', 'exports', 'reports'];
  let createdDirs = 0;
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`  ✅ Created ${dir}/`);
      createdDirs++;
    } else {
      console.log(`  ✓ ${dir}/ exists`);
    }
  });
  
  // Check/create .env file
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');
  
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('  ✅ Created .env from .env.example');
      console.log('\n  ⚠️  Edit .env and add your Supabase credentials:');
      console.log('     SUPABASE_URL=https://your-project.supabase.co');
      console.log('     SUPABASE_KEY=your-anon-key');
    } else {
      // Create a basic .env template
      const envContent = `# GEX Configuration
# Get these from your Supabase project settings

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# Optional: Smartlead API for campaign sync
# SMARTLEAD_API_KEY=your-api-key

# Optional: Telegram notifications
# TELEGRAM_BOT_TOKEN=your-bot-token
# TELEGRAM_CHAT_ID=your-chat-id
`;
      fs.writeFileSync(envPath, envContent);
      console.log('  ✅ Created .env template');
      console.log('\n  ⚠️  Edit .env and add your Supabase credentials');
    }
  } else {
    console.log('  ✓ .env exists');
  }
  
  // Create package.json if missing
  const pkgPath = path.join(__dirname, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    const pkg = {
      name: "gex-cli",
      version: "1.0.0",
      description: "Lead Generation Command Center",
      main: "gex.js",
      scripts: {
        start: "node server.js",
        status: "node gex.js status",
        doctor: "node gex.js doctor"
      },
      dependencies: {
        "@supabase/supabase-js": "^2.0.0",
        "dotenv": "^16.0.0"
      }
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log('  ✅ Created package.json');
  } else {
    console.log('  ✓ package.json exists');
  }
  
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📋 Next steps:
  
  1. Edit .env with your Supabase credentials
  2. Run: npm install
  3. Run: node gex.js doctor
  4. Run: node gex.js status
  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  process.exit(0);
}

// Doctor command - diagnose common issues
if (command === 'doctor' || command === 'diagnose' || command === 'check') {
  const fs = require('fs');
  const path = require('path');
  require('dotenv').config();
  
  console.log('\n🩺 GEX Health Check\n');
  console.log('─'.repeat(50));
  
  let issues = 0;
  let warnings = 0;
  
  // 1. Check .env file
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    console.log('✅ Config file (.env) found');
  } else {
    console.log('❌ Config file (.env) missing');
    if (fs.existsSync(path.join(__dirname, '.env.example'))) {
      console.log('   → Fix: cp .env.example .env && edit .env');
    } else {
      console.log('   → Fix: Create .env with SUPABASE_URL and SUPABASE_KEY');
    }
    issues++;
  }
  
  // 2. Check Supabase connection
  if (process.env.SUPABASE_URL) {
    console.log('✅ SUPABASE_URL configured');
    try {
      new URL(process.env.SUPABASE_URL);
    } catch {
      console.log('❌ SUPABASE_URL is invalid URL format');
      issues++;
    }
  } else {
    console.log('❌ SUPABASE_URL not set');
    console.log('   → Fix: Add SUPABASE_URL=https://xxx.supabase.co to .env');
    issues++;
  }
  
  const apiKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  if (apiKey) {
    console.log('✅ Supabase API key configured');
    if (apiKey.length < 30) {
      console.log('⚠️  API key looks too short (might be invalid)');
      warnings++;
    }
  } else {
    console.log('❌ Supabase API key missing');
    console.log('   → Fix: Add SUPABASE_KEY=eyJ... to .env');
    issues++;
  }
  
  // 3. Check package.json
  try {
    require('./package.json');
    console.log('✅ package.json valid');
  } catch (e) {
    console.log('❌ package.json missing or invalid');
    console.log('   → Fix: Run npm init -y');
    issues++;
  }
  
  // 4. Check required directories
  ['data', 'logs', 'backups'].forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (fs.existsSync(dirPath)) {
      console.log(`✅ ${dir}/ directory exists`);
    } else {
      console.log(`⚠️  ${dir}/ directory missing (will be created on first use)`);
      warnings++;
    }
  });
  
  // 5. Check Node.js version
  const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
  if (nodeVersion >= 18) {
    console.log(`✅ Node.js ${process.version} (supported)`);
  } else if (nodeVersion >= 14) {
    console.log(`⚠️  Node.js ${process.version} (v18+ recommended)`);
    warnings++;
  } else {
    console.log(`❌ Node.js ${process.version} (v18+ required)`);
    issues++;
  }
  
  // 6. Quick connectivity test (optional)
  if (process.env.SUPABASE_URL && apiKey) {
    console.log('\n🔌 Testing database connectivity...');
    const https = require('https');
    const url = new URL(process.env.SUPABASE_URL + '/rest/v1/');
    
    const req = https.get({
      hostname: url.hostname,
      path: url.pathname,
      headers: {
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 5000
    }, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ Database connection successful');
      } else if (res.statusCode === 401) {
        console.log('❌ Database auth failed (check API key)');
        issues++;
      } else {
        console.log(`⚠️  Database returned status ${res.statusCode}`);
        warnings++;
      }
      printSummary();
    });
    
    req.on('error', (e) => {
      console.log(`❌ Database connection failed: ${e.message}`);
      issues++;
      printSummary();
    });
    
    req.on('timeout', () => {
      console.log('❌ Database connection timed out');
      issues++;
      req.destroy();
      printSummary();
    });
  } else {
    printSummary();
  }
  
  function printSummary() {
    console.log('\n' + '─'.repeat(50));
    if (issues === 0 && warnings === 0) {
      console.log('🎉 All checks passed! GEX is ready to use.\n');
    } else if (issues === 0) {
      console.log(`⚠️  ${warnings} warning(s) - GEX should work but check above.\n`);
    } else {
      console.log(`❌ ${issues} issue(s), ${warnings} warning(s) - fix issues above.\n`);
      console.log('Quick fix:');
      console.log('  1. Run: node gex.js setup');
      console.log('  2. Edit .env with your Supabase credentials');
      console.log('  3. Run: node gex.js doctor\n');
    }
    process.exit(issues > 0 ? 1 : 0);
  }
  
  // Don't exit yet if testing connectivity
  if (!process.env.SUPABASE_URL || !apiKey) {
    process.exit(issues > 0 ? 1 : 0);
  }
  return; // Prevent falling through
}

// Setup command - initialize directories and config
if (command === 'setup' || command === 'init') {
  const fs = require('fs');
  const path = require('path');
  
  console.log('\n🔧 GEX Setup\n');
  console.log('─'.repeat(50));
  
  // Create required directories
  const dirs = ['data', 'logs', 'backups', 'exports'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Created ${dir}/`);
    } else {
      console.log(`   ${dir}/ already exists`);
    }
  });
  
  // Check/create .env
  const envPath = path.join(__dirname, '.env');
  const envExamplePath = path.join(__dirname, '.env.example');
  
  if (!fs.existsSync(envPath)) {
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('✅ Created .env from .env.example');
      console.log('   → Edit .env with your Supabase credentials');
    } else {
      // Create minimal .env template
      const template = `# GEX Configuration
# Get these from https://supabase.com/dashboard

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key-here

# Optional
# OPENAI_API_KEY=sk-...
`;
      fs.writeFileSync(envPath, template);
      console.log('✅ Created .env template');
      console.log('   → Edit .env with your Supabase credentials');
    }
  } else {
    console.log('   .env already exists');
  }
  
  console.log('\n' + '─'.repeat(50));
  console.log('✨ Setup complete!\n');
  console.log('Next steps:');
  console.log('  1. Edit .env with your credentials');
  console.log('  2. Run: node gex.js doctor');
  console.log('  3. Run: node gex.js status\n');
  process.exit(0);
}

// Tips for users
const tips = [
  '💡 Use "gex search <keyword>" to quickly find commands',
  '💡 Aliases: s=status, p=pulse, r=rank, d=daily, h=health',
  '💡 Run "gex doctor" if something isn\'t working',
  '💡 Use "gex planner" each morning for your action plan',
  '💡 "gex rank" shows your highest priority leads',
  '💡 Add --verbose/-V to any command for debug output',
  '💡 Run "gex setup" on a new machine to initialize',
  '💡 "gex list" shows all 100+ available commands',
  '💡 "gex goals" tracks your weekly progress',
  '💡 "gex research <domain>" gets company intel fast'
];

if (!command || command === 'help' || command === '--help' || command === '-h') {
  // Show random tip
  const tip = tips[Math.floor(Math.random() * tips.length)];
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🤖  GEX CLI - Lead Generation Command Center                               ║
║       ${Object.keys(commands).length} commands | http://localhost:3456                                   ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   📅 DAILY OPS                            🎯 LEAD MANAGEMENT                 ║
║   ─────────────────────                   ─────────────────────              ║
║   status     Quick check                  closer     Meeting closer          ║
║   pulse      One-line status              rank       AI scoring              ║
║   planner    Daily action plan            prep       Meeting prep            ║
║   daily      Full routine                 drafts     Email drafts            ║
║   brief      Morning summary              calendar   Booking msgs            ║
║   exec       Executive view               rescue     Stuck lead rescue       ║
║   weekly     Weekly report                schedule   Smart timing            ║
║   digest     Telegram format              templates  Email library           ║
║                                           reactivate Cold leads              ║
║                                           rehit      Eric's 60d re-hit       ║
║                                                                              ║
║   🔍 RESEARCH                             📊 ANALYTICS                       ║
║   ─────────────────────                   ─────────────────────              ║
║   research   Company intel                tracker    Trends                  ║
║   competitors Market analysis             goals      Goal progress           ║
║                                           funnel     Conversion              ║
║                                           performance Campaign stats         ║
║                                                                              ║
║   💾 DATA                                 🔧 INFRASTRUCTURE                  ║
║   ─────────────────────                   ─────────────────────              ║
║   export     CSV/JSON/MD                  server     Dashboard               ║
║   backup     Create backups               health     System check            ║
║   report     HTML report                  webhook    Event handler           ║
║   cleanup    Fix data                     api        API docs                ║
║                                                                              ║
║   🔔 ALERTS: notify <hot|stale|enterprise|weekly>                            ║
║   ⏰ CRON:   cron <morning|noon|evening|alert>                               ║
║                                                                              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   🚀 QUICK START                                                             ║
║   ─────────────────────────────────────────────────────────────────────────  ║
║   node gex.js setup             # First-time setup (creates dirs, .env)      ║
║   node gex.js doctor            # Check setup & diagnose issues              ║
║   node gex.js planner           # Today's action plan                        ║
║   node gex.js rank              # Priority leads                             ║
║   node gex.js research unity.com                                             ║
║   node gex.js drafts 10         # Generate emails                            ║
║   node gex.js goals             # Check progress                             ║
║                                                                              ║
║   ⌨️  ALIASES: s=status, p=pulse, d=daily, r=rank, e=export, h=health        ║
║                                                                              ║
║   📖 MORE INFO                                                               ║
║   node gex.js list              # Show all ${String(Object.keys(commands).length).padEnd(3)} commands                     ║
║   node gex.js version           # Version & config info                      ║
║   node gex.js doctor            # Diagnose config issues                     ║
║   node gex.js <command> --help  # Help for specific command                  ║
║                                                                              ║
║   🔧 FLAGS: --verbose/-V (debug output)  --quiet/-q (minimal output)         ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

  ${tip}
`);
  process.exit(0);
}

// Handle aliases
const aliases = {
  's': 'status', 'p': 'pulse', 'd': 'daily', 'r': 'rank', 
  'e': 'export', 'h': 'health', 'g': 'goals', 't': 'templates',
  'f': 'fast', 'i': 'inbox', 'n': 'nba', 'w': 'winrate'
};

const resolved = aliases[command] || command;

// List all commands
// What's new command - show recent updates
if (resolved === 'whatsnew' || resolved === 'changelog' || resolved === 'news') {
  console.log(`
╭────────────────────────────────────────────────────────────╮
│  📰 What's New in GEX CLI                                  │
╰────────────────────────────────────────────────────────────╯

  v1.1.0 (Feb 2026)
  ─────────────────────────────────────────────────────────────
  ✨ New Commands:
     • setup     - First-time setup (creates dirs, .env)
     • doctor    - Diagnose configuration issues
     • search    - Find commands by keyword
  
  🔧 Improvements:
     • Better error messages with actionable fixes
     • Smarter command suggestions for typos
     • Verbose mode (--verbose/-V) for debugging
     • Random tips shown in help output
     • Improved list command with categories
     • Database connectivity testing in doctor
  
  💡 Quick Tips:
     • Use "gex search <word>" to find commands fast
     • Run "gex doctor" if something isn't working
     • Add --verbose to any command for debug info
`);
  process.exit(0);
}

// Search command - find commands by keyword
if (resolved === 'search' || resolved === 'find') {
  const query = filteredArgs[1];
  if (!query) {
    console.log('\n🔍 Search for commands by keyword\n');
    console.log('Usage: node gex.js search <keyword>\n');
    console.log('Examples:');
    console.log('  node gex.js search email     # Find email-related commands');
    console.log('  node gex.js search daily     # Find daily routine commands');
    console.log('  node gex.js search lead      # Find lead management commands\n');
    process.exit(0);
  }
  
  const q = query.toLowerCase();
  const matches = Object.entries(commands).filter(([name, script]) => 
    name.toLowerCase().includes(q) || 
    script.toLowerCase().includes(q)
  );
  
  if (matches.length === 0) {
    console.log(`\n❌ No commands found matching "${query}"\n`);
    console.log('Try a broader search term, or run:');
    console.log('  node gex.js list   # See all commands\n');
    process.exit(1);
  }
  
  console.log(`\n🔍 Commands matching "${query}" (${matches.length} found):\n`);
  matches.forEach(([name, script]) => {
    const scriptName = script.replace('./', '').replace('.js', '');
    console.log(`  ${name.padEnd(15)} → ${scriptName}`);
  });
  console.log(`\nRun: node gex.js <command> --help\n`);
  process.exit(0);
}

if (resolved === 'list' || resolved === 'commands') {
  const fs = require('fs');
  const path = require('path');
  
  // Categorize commands with icons
  const categoryDefs = {
    '📅 Daily Ops': ['daily', 'morning', 'routine', 'status', 'pulse', 'brief', 'digest', 'today', 'planner', 'exec', 'weekly'],
    '🎯 Lead Management': ['lead', 'meeting', 'closer', 'draft', 'email', 'followup', 'rank', 'prep', 'calendar', 'mark', 'schedule', 'template', 'reactivate', 'rehit'],
    '🔍 Research': ['research', 'compet', 'intel'],
    '📊 Analytics': ['tracker', 'goals', 'funnel', 'performance', 'conversion', 'velocity', 'winrate', 'forecast', 'trend', 'roi'],
    '💾 Data & Export': ['export', 'backup', 'cleanup', 'enrich', 'report', 'sync'],
    '🔔 Alerts & Notifications': ['notify', 'alert', 'telegram', 'prevent', 'stale'],
    '🔧 Infrastructure': ['health', 'server', 'webhook', 'api', 'cron', 'sys']
  };
  
  const categories = {};
  Object.entries(commands).forEach(([name, script]) => {
    let assigned = false;
    for (const [cat, keywords] of Object.entries(categoryDefs)) {
      if (keywords.some(kw => script.includes(kw) || name.includes(kw))) {
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(name);
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      if (!categories['🛠️  Other']) categories['🛠️  Other'] = [];
      categories['🛠️  Other'].push(name);
    }
  });
  
  // Check which commands actually have scripts
  const scriptExists = (name) => {
    const scriptPath = path.join(__dirname, commands[name]);
    return fs.existsSync(scriptPath);
  };
  
  console.log(`
╭──────────────────────────────────────────────────────────────╮
│  📋 ALL COMMANDS (${Object.keys(commands).length} total)                                  │
╰──────────────────────────────────────────────────────────────╯
`);
  
  Object.entries(categories).sort().forEach(([cat, cmds]) => {
    console.log(`  ${cat}`);
    console.log(`  ${'─'.repeat(cat.length + 2)}`);
    
    // Format in columns
    const sorted = cmds.sort();
    const cols = 4;
    const colWidth = 15;
    for (let i = 0; i < sorted.length; i += cols) {
      const row = sorted.slice(i, i + cols)
        .map(c => scriptExists(c) ? c.padEnd(colWidth) : `${c}*`.padEnd(colWidth))
        .join('');
      console.log(`    ${row}`);
    }
    console.log('');
  });
  
  console.log(`  ⌨️  Aliases: ${Object.entries(aliases).map(([k,v]) => `${k}→${v}`).join('  ')}`);
  console.log(`\n  * = script not yet implemented`);
  console.log(`\n  💡 Tip: Use "node gex.js <command> --help" for command details\n`);
  process.exit(0);
}

if (!commands[resolved]) {
  // Smart command suggestions using multiple strategies
  const allCmds = Object.keys(commands);
  
  // Strategy 1: Substring match
  let similar = allCmds.filter(c => 
    c.includes(command.toLowerCase()) || command.toLowerCase().includes(c.substring(0, 3))
  );
  
  // Strategy 2: Levenshtein-like simple distance (for typos)
  if (similar.length === 0) {
    similar = allCmds.filter(c => {
      if (Math.abs(c.length - command.length) > 2) return false;
      let matches = 0;
      for (let i = 0; i < Math.min(c.length, command.length); i++) {
        if (c[i] === command.toLowerCase()[i]) matches++;
      }
      return matches >= Math.min(c.length, command.length) - 2;
    });
  }
  
  // Strategy 3: Category-based suggestions for common intents
  const intentMap = {
    'mail': ['drafts', 'email', 'templates', 'batch', 'hotdraft'],
    'lead': ['rank', 'leads', 'score', 'enricher', 'scorecard'],
    'report': ['daily', 'weekly', 'report', 'summary', 'digest'],
    'meeting': ['prep', 'mprep', 'closer', 'calendar', 'book'],
    'data': ['export', 'backup', 'cleanup', 'sync'],
  };
  
  for (const [intent, cmds] of Object.entries(intentMap)) {
    if (command.toLowerCase().includes(intent)) {
      similar = [...new Set([...similar, ...cmds.filter(c => commands[c])])];
      break;
    }
  }
  
  console.error(`\n❌ Unknown command: "${command}"`);
  
  if (similar.length > 0) {
    console.error(`\n💡 Did you mean:`);
    similar.slice(0, 5).forEach(cmd => {
      console.error(`   • ${cmd}`);
    });
  }
  
  // Check if it's an alias they forgot
  const aliasMatch = Object.entries(aliases).find(([k, v]) => v === command);
  if (aliasMatch) {
    console.error(`\n💡 "${command}" is available as full command, try: node gex.js ${command}`);
  }
  
  console.error(`\n📚 Help:`);
  console.error(`   node gex.js help     # Quick reference`);
  console.error(`   node gex.js list     # All ${allCmds.length} commands`);
  console.error(`   node gex.js version  # Config info\n`);
  process.exit(1);
}

const script = commands[resolved];
const scriptArgs = filteredArgs.slice(1);

if (verbose) {
  log.debug(`Resolved command: ${command} → ${resolved}`);
  log.debug(`Script: ${script}`);
  log.debug(`Script args: ${scriptArgs.join(' ') || '(none)'}`);
}

// Load environment with helpful error handling
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Track command history
function logCommandHistory(cmd, args) {
  try {
    const historyPath = path.join(__dirname, 'data', 'command-history.json');
    let history = [];
    if (fs.existsSync(historyPath)) {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    }
    history.unshift({
      command: cmd,
      args: args,
      timestamp: new Date().toISOString()
    });
    // Keep last 100 commands
    history = history.slice(0, 100);
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  } catch (e) {
    // Silent fail - history is non-critical
  }
}

// Log this command execution
logCommandHistory(resolved, scriptArgs);

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.warn(`⚠️  Warning: Error loading .env: ${result.error.message}`);
  }
} else {
  // Check if we have env vars from parent process
  if (!process.env.SUPABASE_URL) {
    console.warn('⚠️  No .env file found and SUPABASE_URL not set');
    console.warn('   Run "node gex.js doctor" to diagnose\n');
  }
}

// Verify script exists before spawning
const scriptPath = path.join(__dirname, script);
if (!fs.existsSync(scriptPath)) {
  console.error(`\n❌ Script not found: ${script}`);
  console.error(`   Expected path: ${scriptPath}`);
  console.error(`\n💡 This command may not be implemented yet.`);
  console.error(`   Available similar commands:`);
  
  // Find similar commands that do exist
  const available = Object.entries(commands)
    .filter(([name, s]) => fs.existsSync(path.join(__dirname, s)))
    .map(([name]) => name);
  const similar = available.filter(c => 
    c.includes(resolved.slice(0, 3)) || resolved.includes(c.slice(0, 3))
  );
  if (similar.length > 0) {
    console.error(`   → ${similar.slice(0, 5).join(', ')}\n`);
  } else {
    console.error(`   → Run "node gex.js list" to see all commands\n`);
  }
  process.exit(1);
}

// Check if database commands have required config
const dbRequiredCommands = ['status', 'rank', 'leads', 'funnel', 'pipeline', 'export', 'sync'];
if (dbRequiredCommands.some(c => resolved.includes(c))) {
  if (!process.env.SUPABASE_URL) {
    console.error('\n⚠️  This command requires database access.');
    console.error('   SUPABASE_URL is not configured.\n');
    console.error('   Fix: Run "node gex.js doctor" for setup help\n');
    // Continue anyway - let the script handle the error with more context
  }
}

const child = spawn('node', [script, ...scriptArgs], {
  stdio: 'inherit',
  cwd: __dirname,
  env: { ...process.env, GEX_COMMAND: resolved }
});

child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error(`\n❌ Node.js not found. Is it installed?\n`);
  } else if (err.code === 'EACCES') {
    console.error(`\n❌ Permission denied running: ${script}`);
    console.error(`   Try: chmod +x ${scriptPath}\n`);
  } else {
    console.error(`\n❌ Failed to start command: ${err.message}`);
    console.error(`   Command: ${resolved}`);
    console.error(`   Script: ${script}\n`);
  }
  process.exit(1);
});

child.on('close', (code) => {
  if (code !== 0 && code !== null) {
    // Add helpful message for common exit codes
    if (code === 127) {
      console.error('\n💡 Script dependency not found. Try: npm install\n');
    } else if (code === 1 && !process.env.SUPABASE_URL) {
      console.error('\n💡 Command failed. Database may not be configured.');
      console.error('   Run: node gex.js doctor\n');
    }
  }
  process.exit(code || 0);
});
