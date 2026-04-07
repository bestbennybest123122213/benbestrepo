#!/usr/bin/env node
/**
 * Onboarding - Getting started guide for new users
 * 
 * Interactive walkthrough of GEX features.
 */

console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║                                                                          ║
║   🎉 WELCOME TO GEX                                                      ║
║   Lead Generation Command Center                                         ║
║                                                                          ║
╚══════════════════════════════════════════════════════════════════════════╝

  GEX helps you manage your cold email outreach with 100+ commands.
  Here's how to get started:

  ═══════════════════════════════════════════════════════════════════════

  📋 STEP 1: Check your setup
  
     $ node gex.js doctor
     
     This verifies your configuration is correct.

  ═══════════════════════════════════════════════════════════════════════

  📊 STEP 2: Learn the essential commands
  
     $ node gex.js start      # Morning routine - start here each day
     $ node gex.js pulse      # Quick one-line status
     $ node gex.js nba        # Next best action to take
     $ node gex.js inbox      # Priority inbox

  ═══════════════════════════════════════════════════════════════════════

  ⌨️  STEP 3: Learn the shortcuts
  
     Aliases:  s=status, p=pulse, n=nba, f=fast
     Keyboard: Run 'node gex.js hotkeys' for full list

  ═══════════════════════════════════════════════════════════════════════

  📚 STEP 4: Explore more
  
     $ node gex.js help       # Quick help
     $ node gex.js list       # All 100+ commands
     $ node gex.js workflow   # Step-by-step guides
     $ node gex.js tips       # Random productivity tips

  ═══════════════════════════════════════════════════════════════════════

  🌟 PRO TIPS
  
     • Start each day with 'node gex.js start'
     • Hot leads (≤3 days) convert 10x better - prioritize them!
     • Use 'node gex.js watch' for a live monitoring dashboard
     • Access Mission Control: 'node gex.js mc'

  ═══════════════════════════════════════════════════════════════════════

  Ready to go? Run 'node gex.js start' to begin!

`);
