#!/usr/bin/env node
/**
 * About - System information and credits
 */

const pkg = require('./package.json');

console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║   ██████╗ ███████╗██╗  ██╗                                               ║
║  ██╔════╝ ██╔════╝╚██╗██╔╝                                               ║
║  ██║  ███╗█████╗   ╚███╔╝                                                ║
║  ██║   ██║██╔══╝   ██╔██╗                                                ║
║  ╚██████╔╝███████╗██╔╝ ██╗                                               ║
║   ╚═════╝ ╚══════╝╚═╝  ╚═╝                                               ║
║                                                                          ║
║   Lead Generation Command Center                                         ║
║   Version ${(pkg.version || '1.0.0').padEnd(50)}     ║
║                                                                          ║
╠══════════════════════════════════════════════════════════════════════════╣
║                                                                          ║
║   📊 Overview                                                            ║
║   ─────────────────────────────────────────────────────                  ║
║   • 100+ CLI commands for lead management                                ║
║   • Real-time dashboard with keyboard shortcuts                          ║
║   • Mission Control integration                                          ║
║   • Smart lead scoring and prioritization                                ║
║   • Email draft generation                                               ║
║   • Supabase + Smartlead integration                                     ║
║                                                                          ║
║   🚀 Quick Start                                                         ║
║   ─────────────────────────────────────────────────────                  ║
║   node gex.js setup       # First-time setup                             ║
║   node gex.js start       # Morning routine                              ║
║   node gex.js onboarding  # Getting started guide                        ║
║                                                                          ║
║   📚 Documentation                                                       ║
║   ─────────────────────────────────────────────────────                  ║
║   node gex.js help        # Quick reference                              ║
║   node gex.js list        # All commands                                 ║
║   node gex.js workflow    # Step-by-step guides                          ║
║                                                                          ║
║   🔗 Part of Clawdbot AI Assistant                                       ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝
`);
